/* global React, firebase */
// ===========================================================
// firebase-bridge — 작업방 기능을 위한 Firebase 어댑터
//
// 설계 원칙:
// • config 없으면 자동으로 "로컬 모드"로 폴백 — 혼자서 미리 볼 수 있음.
// • Firestore 쓰기는 "사건"이 일어날 때만 (작업 시작/정지, 진행도 변경, 박수, 입퇴장).
//   흐르는 시간은 절대 서버에 쓰지 않음 — 클라이언트가 workStartedAt 기반으로 매초 계산.
// • heartbeat lastActiveAt 은 2~3분 주기, 또는 상태 변화 시에만.
// • Firebase compat SDK 를 gstatic CDN 에서 동적 로드 (vendor 정적 파일 안 씀).
// ===========================================================

(function () {
  if (window.firebaseBridge) return;  // 중복 로드 방지
  const STATUS = { IDLE: "idle", LOADING: "loading", READY: "ready", LOCAL: "local", ERROR: "error" };
  let status = STATUS.IDLE;
  let statusError = null;
  let app = null;
  let auth = null;
  let db = null;
  let _uid = null;
  let initPromise = null;
  const statusSubs = new Set();

  const log = (...a) => { try { console.log("[room]", ...a); } catch (_) {} };
  const setStatus = (s, err = null) => {
    status = s; statusError = err;
    for (const fn of statusSubs) { try { fn(s, err); } catch (_) {} }
  };

  function hasConfig() {
    const c = window.FIREBASE_CONFIG || {};
    return !!(c.apiKey && c.projectId);
  }

  // 로컬 모드용 uid (localStorage)
  const LOCAL_UID_KEY = "todoary.room.localUid";
  function getOrMakeLocalUid() {
    try {
      let u = localStorage.getItem(LOCAL_UID_KEY);
      if (!u) {
        u = "local-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem(LOCAL_UID_KEY, u);
      }
      return u;
    } catch (_) {
      return "local-anon";
    }
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error("스크립트 로드 실패: " + src));
      document.head.appendChild(s);
    });
  }

  async function ensureSDKLoaded() {
    if (window.firebase && window.firebase.firestore) return;
    const v = window.FIREBASE_VERSION || "10.13.0";
    const base = `https://www.gstatic.com/firebasejs/${v}`;
    // compat 빌드 — 글로벌 firebase 노출
    await loadScript(`${base}/firebase-app-compat.js`);
    await loadScript(`${base}/firebase-auth-compat.js`);
    await loadScript(`${base}/firebase-firestore-compat.js`);
  }

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!hasConfig()) {
        log("config 없음 — 로컬 모드");
        _uid = getOrMakeLocalUid();
        setStatus(STATUS.LOCAL);
        return;
      }
      try {
        setStatus(STATUS.LOADING);
        await ensureSDKLoaded();
        app = firebase.initializeApp(window.FIREBASE_CONFIG);
        auth = firebase.auth();
        db = firebase.firestore();
        // 익명 로그인 (이미 로그인돼 있으면 기다림)
        await new Promise((res, rej) => {
          const unsub = auth.onAuthStateChanged(async (user) => {
            if (user) { _uid = user.uid; unsub(); res(); return; }
            try {
              await auth.signInAnonymously();
            } catch (e) { unsub(); rej(e); }
          });
        });
        log("ready uid=", _uid);
        setStatus(STATUS.READY);
      } catch (e) {
        log("init 실패 — 로컬 모드로 폴백", e);
        _uid = getOrMakeLocalUid();
        setStatus(STATUS.LOCAL, e);
      }
    })();
    return initPromise;
  }

  function uid() { return _uid; }
  function getStatus() { return status; }
  function getError() { return statusError; }
  function isLocal() { return status === STATUS.LOCAL; }
  function isReady() { return status === STATUS.READY; }
  function subscribeStatus(fn) { statusSubs.add(fn); return () => statusSubs.delete(fn); }

  // ---- ServerTimestamp / Timestamp 헬퍼 ----
  function serverNow() {
    if (isReady() && firebase.firestore && firebase.firestore.FieldValue) {
      return firebase.firestore.FieldValue.serverTimestamp();
    }
    return Date.now();
  }
  // Timestamp → ms 로 normalize (서버/클라이언트 양쪽 대응)
  function tsToMs(t) {
    if (t == null) return null;
    if (typeof t === "number") return t;
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.seconds === "number") return t.seconds * 1000;
    return null;
  }

  // ===========================================================
  // 방 CRUD (READY 모드)
  // ===========================================================
  async function createRoom_remote({ name, hostUid, code }) {
    const ref = db.collection("rooms").doc();
    await ref.set({
      name: name || "우리 작업방",
      inviteCode: code,
      hostUid,
      memberCount: 0,
      createdAt: serverNow(),
    });
    return { id: ref.id, name, inviteCode: code };
  }

  async function findRoomByCode_remote(code) {
    const snap = await db.collection("rooms").where("inviteCode", "==", code).limit(1).get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }

  // 4명 제한 — room.memberCount 를 증가, 보안 규칙이 < 4 강제
  async function joinRoom_remote(roomId, uid, fields) {
    const roomRef = db.collection("rooms").doc(roomId);
    const memberRef = roomRef.collection("members").doc(uid);
    const memberDoc = await memberRef.get();
    const alreadyMember = memberDoc.exists;
    if (!alreadyMember) {
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) throw new Error("ROOM_NOT_FOUND");
      const count = roomDoc.data().memberCount || 0;
      if (count >= 4) throw new Error("ROOM_FULL");
      try {
        await roomRef.update({ memberCount: count + 1 });
      } catch (e) {
        // 규칙이 거부 = 누가 먼저 들어가서 4명 됐을 가능성
        throw new Error("ROOM_FULL");
      }
    }
    const memberPayload = {
      displayName: fields.displayName || "이름없음",
      avatar: fields.avatar || "🐰",
      status: "idle",
      workStartedAt: null,
      accumulatedSecondsToday: 0,
      accumulatedDate: todayLocal(),
      todoTotal: 0,
      todoDone: 0,
      visibleTodos: [],
      lastActiveAt: serverNow(),
      joinedAt: serverNow(),
    };
    await memberRef.set(memberPayload, { merge: true });
    return { roomId, alreadyMember };
  }

  // 나가기 — 원자적: 멤버 삭제 + 카운트 감소.
  // 마지막 1명이면 방 + 하위 claps 까지 정리해서 유령 방을 남기지 않음.
  async function leaveRoom_remote(roomId, uid) {
    const roomRef = db.collection("rooms").doc(roomId);
    const memberRef = roomRef.collection("members").doc(uid);

    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) return;
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) {
      // 방이 이미 사라졌다면 (다른 곳에서 청소됨) 멤버 문서만 정리 시도
      await memberRef.delete().catch(() => {});
      return;
    }
    const count = (roomDoc.data() || {}).memberCount || 0;
    const willBeLast = count <= 1;

    // 마지막 1명이라면: claps 를 먼저 비움 (아직 본인이 멤버 권한 가지고 있을 때)
    if (willBeLast) {
      try {
        const clapsSnap = await roomRef.collection("claps").get();
        if (!clapsSnap.empty) {
          const batch = db.batch();
          clapsSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (e) { log("claps cleanup 실패 (계속 진행)", e); }
    }

    // 트랜잭션: 방/카운트 먼저 (아직 멤버 권한 있을 때) → 멤버 삭제
    // 멤버를 먼저 지우면 isMember 규칙 때문에 room update/delete 가 거부됨
    await db.runTransaction(async (tx) => {
      const md = await tx.get(memberRef);
      const rd = await tx.get(roomRef);
      if (!md.exists) return;
      if (!rd.exists) {
        tx.delete(memberRef);
        return;
      }
      const c = rd.data().memberCount || 0;
      if (c <= 1) {
        tx.delete(roomRef);
      } else {
        tx.update(roomRef, { memberCount: c - 1 });
      }
      tx.delete(memberRef);
    });
  }

  // ---- 내 멤버 문서 부분 업데이트 (cost-aware) ----
  // 사건 단위 호출만 허용 — 매초/매분 호출 금지.
  async function updateMyMember_remote(roomId, uid, patch) {
    if (!roomId || !uid) return;
    const memberRef = db.collection("rooms").doc(roomId).collection("members").doc(uid);
    // workStartedAt 은 Date.now() 또는 null 로 들어옴 → Timestamp 변환
    const out = { ...patch, lastActiveAt: serverNow() };
    if ("workStartedAt" in patch) {
      out.workStartedAt = patch.workStartedAt
        ? firebase.firestore.Timestamp.fromMillis(patch.workStartedAt)
        : null;
    }
    // 구버전 필드 정리 — visibleTodos 가 들어오는 patch 라면 함께 삭제
    if ("visibleTodos" in patch) {
      const del = firebase.firestore.FieldValue.delete();
      out.showTodoTitle = del;
      out.currentTodoTitle = del;
      out.recentTodos = del;
    }
    await memberRef.set(out, { merge: true });
  }

  async function memberExists_remote(roomId, uid) {
    if (!roomId || !uid) return false;
    const doc = await db.collection("rooms").doc(roomId).collection("members").doc(uid).get();
    return doc.exists;
  }

  // ---- 멤버 실시간 구독 ----
  function watchMembers_remote(roomId, cb) {
    if (!roomId) return () => {};
    return db.collection("rooms").doc(roomId).collection("members")
      .onSnapshot((snap) => {
        const arr = [];
        snap.forEach((d) => {
          const data = d.data();
          arr.push({
            uid: d.id,
            displayName: data.displayName,
            avatar: data.avatar,
            status: data.status,
            workStartedAt: tsToMs(data.workStartedAt),
            accumulatedSecondsToday: data.accumulatedSecondsToday || 0,
            accumulatedDate: data.accumulatedDate || null,
            todoTotal: data.todoTotal || 0,
            todoDone: data.todoDone || 0,
            // 공개로 표시한 할일 제목들만. 비공개 제목은 절대 서버에 안 올라감.
            visibleTodos: Array.isArray(data.visibleTodos) ? data.visibleTodos : [],
            lastActiveAt: tsToMs(data.lastActiveAt),
            joinedAt: tsToMs(data.joinedAt),
          });
        });
        cb(arr);
      }, (err) => log("watchMembers 에러", err));
  }

  // ---- 방 메타 (이름/초대코드) 구독 ----
  function watchRoom_remote(roomId, cb) {
    if (!roomId) return () => {};
    return db.collection("rooms").doc(roomId)
      .onSnapshot((d) => {
        if (!d.exists) { cb(null); return; }
        cb({ id: d.id, ...d.data() });
      });
  }

  // ---- 박수 (사건성, 저빈도) ----
  async function sendClap_remote(roomId, fromUid, toUid) {
    if (!roomId || !fromUid || !toUid) return;
    await db.collection("rooms").doc(roomId).collection("claps").add({
      fromUid, toUid, createdAt: serverNow(),
    });
  }
  function watchRecentClaps_remote(roomId, sinceMs, cb) {
    if (!roomId) return () => {};
    const since = firebase.firestore.Timestamp.fromMillis(sinceMs);
    return db.collection("rooms").doc(roomId).collection("claps")
      .where("createdAt", ">", since)
      .onSnapshot((snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type !== "added") return;
          const d = ch.doc.data();
          cb({ id: ch.doc.id, fromUid: d.fromUid, toUid: d.toUid, ts: tsToMs(d.createdAt) });
        });
      }, (err) => log("watchClaps 에러", err));
  }

  // ===========================================================
  // 로컬 모드 — 같은 인터페이스, 메모리/localStorage 백업
  // ===========================================================
  const LOCAL_STORE_KEY = "todoary.room.localStore";
  let localState = null;
  const localSubs = { members: new Set(), room: new Set(), claps: new Set() };

  function loadLocal() {
    if (localState) return;
    try {
      localState = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY)) || { rooms: {} };
    } catch (_) {
      localState = { rooms: {} };
    }
  }
  function saveLocal() {
    try { localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(localState)); } catch (_) {}
  }
  function fireLocalMembers(roomId) {
    const room = localState.rooms[roomId];
    const members = room
      ? Object.entries(room.members || {}).map(([uid, m]) => ({ uid, ...m }))
      : [];
    for (const fn of localSubs.members) { try { fn(roomId, members); } catch (_) {} }
  }
  function fireLocalRoom(roomId) {
    const room = localState.rooms[roomId];
    for (const fn of localSubs.room) { try { fn(roomId, room || null); } catch (_) {} }
  }

  async function createRoom_local({ name, hostUid, code }) {
    loadLocal();
    const id = "local-" + Math.random().toString(36).slice(2, 10);
    localState.rooms[id] = {
      id, name: name || "우리 작업방", inviteCode: code, hostUid,
      memberCount: 0, createdAt: Date.now(), members: {}, claps: [],
    };
    saveLocal();
    return { id, name, inviteCode: code };
  }
  async function findRoomByCode_local(code) {
    loadLocal();
    const room = Object.values(localState.rooms).find((r) => r.inviteCode === code);
    return room ? { ...room } : null;
  }
  async function joinRoom_local(roomId, uid, fields) {
    loadLocal();
    const room = localState.rooms[roomId];
    if (!room) throw new Error("ROOM_NOT_FOUND");
    const already = !!room.members[uid];
    const count = Object.keys(room.members).length;
    if (!already && count >= 4) throw new Error("ROOM_FULL");
    room.members[uid] = {
      displayName: fields.displayName || "나",
      avatar: fields.avatar || "🐰",
      status: "idle",
      workStartedAt: null,
      accumulatedSecondsToday: 0,
      accumulatedDate: todayLocal(),
      todoTotal: 0,
      todoDone: 0,
      visibleTodos: [],
      lastActiveAt: Date.now(),
      joinedAt: room.members[uid]?.joinedAt || Date.now(),
    };
    room.memberCount = Object.keys(room.members).length;
    saveLocal();
    fireLocalRoom(roomId);
    fireLocalMembers(roomId);
    return { roomId, alreadyMember: already };
  }
  async function leaveRoom_local(roomId, uid) {
    loadLocal();
    const room = localState.rooms[roomId];
    if (!room) return;
    delete room.members[uid];
    room.memberCount = Object.keys(room.members).length;
    // 마지막 멤버였으면 방 자체 삭제 — 유령 방 방지
    if (room.memberCount === 0) {
      delete localState.rooms[roomId];
      saveLocal();
      fireLocalRoom(roomId);   // null 발사 → 구독자가 방 사라짐 감지
      fireLocalMembers(roomId);
      return;
    }
    saveLocal();
    fireLocalRoom(roomId);
    fireLocalMembers(roomId);
  }
  async function updateMyMember_local(roomId, uid, patch) {
    loadLocal();
    const room = localState.rooms[roomId];
    if (!room || !room.members[uid]) return;
    room.members[uid] = { ...room.members[uid], ...patch, lastActiveAt: Date.now() };
    saveLocal();
    fireLocalMembers(roomId);
  }
  async function memberExists_local(roomId, uid) {
    loadLocal();
    const room = localState.rooms[roomId];
    return !!(room && room.members && room.members[uid]);
  }
  function watchMembers_local(roomId, cb) {
    const handler = (rid, members) => { if (rid === roomId) cb(members); };
    localSubs.members.add(handler);
    // 초기값 즉시 발사
    setTimeout(() => fireLocalMembers(roomId), 0);
    return () => localSubs.members.delete(handler);
  }
  function watchRoom_local(roomId, cb) {
    const handler = (rid, room) => { if (rid === roomId) cb(room); };
    localSubs.room.add(handler);
    setTimeout(() => fireLocalRoom(roomId), 0);
    return () => localSubs.room.delete(handler);
  }
  async function sendClap_local(roomId, fromUid, toUid) {
    loadLocal();
    const room = localState.rooms[roomId];
    if (!room) return;
    const clap = { id: Math.random().toString(36).slice(2), fromUid, toUid, ts: Date.now() };
    room.claps = (room.claps || []).slice(-50);
    room.claps.push(clap);
    saveLocal();
    for (const fn of localSubs.claps) { try { fn(roomId, clap); } catch (_) {} }
  }
  function watchRecentClaps_local(roomId, sinceMs, cb) {
    const handler = (rid, clap) => { if (rid === roomId && clap.ts > sinceMs) cb(clap); };
    localSubs.claps.add(handler);
    return () => localSubs.claps.delete(handler);
  }

  // ===========================================================
  // 디스패처 — 모드에 따라 라우팅
  // ===========================================================
  function pick(remote, local) {
    return (...args) => (isReady() ? remote(...args) : local(...args));
  }

  function todayLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  window.firebaseBridge = {
    STATUS,
    init,
    hasConfig,
    uid,
    getStatus,
    getError,
    isLocal,
    isReady,
    subscribeStatus,
    todayLocal,
    rooms: {
      create: pick(createRoom_remote, createRoom_local),
      findByCode: pick(findRoomByCode_remote, findRoomByCode_local),
      join: pick(joinRoom_remote, joinRoom_local),
      leave: pick(leaveRoom_remote, leaveRoom_local),
      watch: pick(watchRoom_remote, watchRoom_local),
    },
    members: {
      updateMine: pick(updateMyMember_remote, updateMyMember_local),
      watch: pick(watchMembers_remote, watchMembers_local),
      exists: pick(memberExists_remote, memberExists_local),
    },
    claps: {
      send: pick(sendClap_remote, sendClap_local),
      watchRecent: pick(watchRecentClaps_remote, watchRecentClaps_local),
    },
  };
})();
