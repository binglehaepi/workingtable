/* global React, firebase */
// ===========================================================
// firebase-bridge — 작업방 기능을 위한 Firebase 어댑터
//
// 설계 원칙:
// • config 없으면 자동으로 "로컬 모드"로 폴백 — 혼자서 미리 볼 수 있음.
// • Firestore 쓰기는 "사건"이 일어날 때만 (작업 시작/정지, 진행도 변경, 박수, 입퇴장).
//   흐르는 시간은 절대 서버에 쓰지 않음 — 클라이언트가 workStartedAt 기반으로 매초 계산.
// • heartbeat lastActiveAt 은 view-room ROOM_HEARTBEAT_* 상수(약 4분), 상태 변화 시 즉시.
// • members 는 uid별 doc onSnapshot; roster 는 memberCount 변경 시에만 .get().
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
  const ROOM_STATUS_MSG_MAX = 25;

  function sanitizeMemberPatch(patch) {
    if (!patch || typeof patch !== "object") return patch;
    const out = { ...patch };
    if ("statusMessage" in out) {
      out.statusMessage = String(out.statusMessage ?? "").slice(0, ROOM_STATUS_MSG_MAX);
    }
    if ("statusMessageAt" in out) {
      const n = Number(out.statusMessageAt);
      out.statusMessageAt = Number.isFinite(n) ? Math.floor(n) : Date.now();
    }
    return out;
  }
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
  function isDevSandbox() {
    try {
      return !!(window.roomDevSandbox && window.roomDevSandbox.isEnabled());
    } catch (_) { return false; }
  }

  function getOrMakeLocalUid() {
    try {
      if (isDevSandbox()) {
        const devUid = "dev-me";
        localStorage.setItem(LOCAL_UID_KEY, devUid);
        return devUid;
      }
      let u = localStorage.getItem(LOCAL_UID_KEY);
      if (!u) {
        u = "local-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem(LOCAL_UID_KEY, u);
      }
      return u;
    } catch (_) {
      return isDevSandbox() ? "dev-me" : "local-anon";
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
      if (isDevSandbox()) {
        log("개발 샌드박스 — 로컬 전용 (Firestore 미사용)");
        _uid = getOrMakeLocalUid();
        setStatus(STATUS.LOCAL);
        return;
      }
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
  function normalizeVisibleSubTasks(items) {
    if (!Array.isArray(items)) return [];
    return items.map((st) => {
      if (typeof st === "string") return { title: st.slice(0, 80), done: false };
      if (st && typeof st.title === "string") {
        const title = String(st.title).trim().slice(0, 80);
        return title ? { title, done: !!st.done } : null;
      }
      return null;
    }).filter(Boolean);
  }

  function normalizeVisibleTodos(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      if (typeof item === "string") return { title: item.slice(0, 160), done: false, subTasks: [] };
      if (item && typeof item.title === "string") {
        const title = String(item.title).trim().slice(0, 160);
        if (!title) return null;
        return {
          title,
          done: !!item.done,
          subTasks: normalizeVisibleSubTasks(item.subTasks),
        };
      }
      return null;
    }).filter(Boolean);
  }

  function normalizeInviteCode(code) {
    return String(code || "").trim().toUpperCase();
  }

  /** members/{uid} 스냅샷 → room-store 가 쓰는 멤버 객체 */
  function memberFromMemberDoc(d) {
    if (!d || !d.exists) return null;
    const data = d.data({ serverTimestamps: "estimate" });
    return {
      uid: d.id,
      displayName: data.displayName,
      avatar: data.avatar,
      status: data.status,
      workStartedAt: tsToMs(data.workStartedAt),
      accumulatedSecondsToday: data.accumulatedSecondsToday || 0,
      accumulatedDate: data.accumulatedDate || null,
      workSecondsTotal: data.workSecondsTotal || 0,
      roomLevel: data.roomLevel || 0,
      lastLevelDay: data.lastLevelDay || null,
      statusMessage: String(data.statusMessage || "").slice(0, ROOM_STATUS_MSG_MAX),
      statusMessageAt: tsToMs(data.statusMessageAt) || null,
      todoTotal: data.todoTotal || 0,
      todoDone: data.todoDone || 0,
      visibleTodos: normalizeVisibleTodos(data.visibleTodos),
      recentLog: Array.isArray(data.recentLog) ? data.recentLog : [],
      lastActiveAt: tsToMs(data.lastActiveAt),
      joinedAt: tsToMs(data.joinedAt),
    };
  }

  // memberCount 변경 시 멤버 roster 동기화 (watchMembers per-doc 리스너용)
  const memberRosterSyncByRoom = new Map();
  function registerMemberRosterSync(roomId, fn) {
    if (!memberRosterSyncByRoom.has(roomId)) memberRosterSyncByRoom.set(roomId, new Set());
    memberRosterSyncByRoom.get(roomId).add(fn);
    return () => { memberRosterSyncByRoom.get(roomId)?.delete(fn); };
  }
  function triggerMemberRosterSync(roomId) {
    for (const fn of memberRosterSyncByRoom.get(roomId) || []) {
      try { fn(); } catch (_) {}
    }
  }

  function inviteCodeLookupRef(code) {
    return db.collection("inviteCodes").doc(normalizeInviteCode(code));
  }

  function isFirestorePermissionError(e) {
    if (!e) return false;
    const code = e.code || e.name || "";
    const msg = String(e.message || "");
    return code === "permission-denied"
      || /insufficient permissions|permission.denied/i.test(msg);
  }

  // ===========================================================
  // 방 CRUD (READY 모드)
  // ===========================================================
  async function createRoom_remote({ name, hostUid, code }) {
    const inviteCode = normalizeInviteCode(code);
    const ref = db.collection("rooms").doc();
    const roomData = {
      name: name || "우리 작업방",
      inviteCode,
      hostUid,
      memberCount: 0,
      totalWorkSeconds: 0,
      createdAt: serverNow(),
    };
    try {
      const batch = db.batch();
      batch.set(ref, roomData);
      batch.set(inviteCodeLookupRef(inviteCode), { roomId: ref.id });
      await batch.commit();
    } catch (e) {
      log("inviteCodes create skip — room only", e);
      await ref.set(roomData);
    }
    return { id: ref.id, name, inviteCode };
  }

  // 초대코드 입장: inviteCodes/{code} get (1 read) 우선, 구버전만 where 폴백
  async function findRoomByCode_remote(code) {
    const inviteCode = normalizeInviteCode(code);
    if (!inviteCode) return null;

    let lookup = null;
    try {
      lookup = await inviteCodeLookupRef(inviteCode).get();
    } catch (e) {
      if (!isFirestorePermissionError(e)) throw e;
      log("inviteCodes lookup skip", e);
    }
    if (lookup && lookup.exists) {
      const roomId = lookup.data().roomId;
      if (roomId) {
        const roomDoc = await db.collection("rooms").doc(roomId).get();
        if (roomDoc.exists) return { id: roomDoc.id, ...roomDoc.data() };
      }
    }

    const snap = await db.collection("rooms")
      .where("inviteCode", "==", inviteCode)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    try {
      await inviteCodeLookupRef(inviteCode).set({ roomId: d.id }, { merge: true });
    } catch (e) { log("inviteCodes backfill skip", e); }
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
      avatar: fields.avatar ?? 22,
      status: "idle",
      workStartedAt: null,
      accumulatedSecondsToday: 0,
      accumulatedDate: todayLocal(),
      workSecondsTotal: 0,
      roomLevel: 0,
      lastLevelDay: null,
      statusMessage: "",
      statusMessageAt: null,
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
  // 마지막 1명이면 방을 삭제해서 유령 방을 남기지 않음.
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
    // 박수는 room.recentClaps 배열만 사용 — 마지막 1명 퇴장 시 방 삭제로 함께 제거.
    // (구 claps/* 서브컬렉션은 미사용; 퇴장 시 .get() 전체 조회 제거)

    // 트랜잭션: 방/카운트 먼저 (아직 멤버 권한 있을 때) → 멤버 삭제
    // 멤버를 먼저 지우면 isMember 규칙 때문에 room update/delete 가 거부됨
    let inviteCodeToCleanup = null;
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
        inviteCodeToCleanup = normalizeInviteCode(rd.data().inviteCode);
        tx.delete(roomRef);
      } else {
        tx.update(roomRef, { memberCount: c - 1 });
      }
      tx.delete(memberRef);
    });
    if (inviteCodeToCleanup) {
      try {
        await inviteCodeLookupRef(inviteCodeToCleanup).delete();
      } catch (e) { log("inviteCodes cleanup skip", e); }
    }
  }

  // ---- 내 멤버 문서 부분 업데이트 (cost-aware) ----
  // 사건 단위 호출만 허용 — 매초/매분 호출 금지.
  async function updateMyMember_remote(roomId, uid, patch) {
    if (!roomId || !uid) return;
    const memberRef = db.collection("rooms").doc(roomId).collection("members").doc(uid);
    const safe = sanitizeMemberPatch(patch);
    const out = { ...safe, lastActiveAt: serverNow() };
    if ("workStartedAt" in safe) {
      out.workStartedAt = safe.workStartedAt ? serverNow() : null;
    }
    if ("visibleTodos" in safe) {
      const del = firebase.firestore.FieldValue.delete();
      out.showTodoTitle = del;
      out.currentTodoTitle = del;
      out.recentTodos = del;
    }
    await memberRef.set(out, { merge: true });
  }

  async function updateMyMemberWithLog_remote(roomId, uid, patch, logEntry) {
    if (!roomId || !uid) return;
    const memberRef = db.collection("rooms").doc(roomId).collection("members").doc(uid);
    const safe = sanitizeMemberPatch(patch);
    const out = { ...safe, lastActiveAt: serverNow() };
    if ("workStartedAt" in safe) {
      out.workStartedAt = safe.workStartedAt ? serverNow() : null;
    }
    if ("visibleTodos" in safe) {
      const del = firebase.firestore.FieldValue.delete();
      out.showTodoTitle = del;
      out.currentTodoTitle = del;
      out.recentTodos = del;
    }
    await db.runTransaction(async (tx) => {
      if (logEntry && logEntry.text) {
        const memberSnap = await tx.get(memberRef);
        const data = memberSnap.exists ? memberSnap.data() : {};
        const recent = Array.isArray(data.recentLog) ? data.recentLog : [];
        out.recentLog = recent.concat([{
          uid,
          nickname: logEntry.nickname || "이름없음",
          text: String(logEntry.text).slice(0, 160),
          todoPublic: !!logEntry.todoPublic,
          at: Date.now(),
        }]).slice(-50);
      }
      tx.set(memberRef, out, { merge: true });
    });
  }

  async function memberExists_remote(roomId, uid) {
    if (!roomId || !uid) return false;
    const doc = await db.collection("rooms").doc(roomId).collection("members").doc(uid).get();
    return doc.exists;
  }

  // ---- 멤버 실시간 구독 — uid별 doc 리스너 (heartbeat 시 변경된 문서만 read 증폭 방지) ----
  function watchMembers_remote(roomId, cb) {
    if (!roomId) return () => {};
    let stopped = false;
    const membersByUid = new Map();
    const docUnsubs = new Map();
    let rosterUids = new Set();
    const membersCol = () => db.collection("rooms").doc(roomId).collection("members");

    function emit() {
      if (!stopped) cb(Array.from(membersByUid.values()));
    }

    function detachDoc(uid) {
      const unsub = docUnsubs.get(uid);
      if (unsub) { unsub(); docUnsubs.delete(uid); }
      membersByUid.delete(uid);
    }

    function attachDoc(uid) {
      if (docUnsubs.has(uid)) return;
      const unsub = membersCol().doc(uid)
        .onSnapshot((d) => {
          if (stopped) return;
          if (!d.exists) {
            detachDoc(uid);
            rosterUids.delete(uid);
            emit();
            return;
          }
          const row = memberFromMemberDoc(d);
          if (row) membersByUid.set(uid, row);
          emit();
        }, (err) => log("watchMemberDoc", uid, err));
      docUnsubs.set(uid, unsub);
    }

    async function syncRoster() {
      if (stopped) return;
      try {
        const snap = await membersCol().get();
        const next = new Set(snap.docs.map((d) => d.id));
        for (const d of snap.docs) {
          if (!rosterUids.has(d.id)) {
            const row = memberFromMemberDoc(d);
            if (row) membersByUid.set(d.id, row);
            attachDoc(d.id);
          }
        }
        for (const uid of rosterUids) {
          if (!next.has(uid)) detachDoc(uid);
        }
        rosterUids = next;
        emit();
      } catch (e) {
        log("syncRoster", e);
      }
    }

    syncRoster();
    const unregRoster = registerMemberRosterSync(roomId, syncRoster);

    return () => {
      stopped = true;
      unregRoster();
      for (const unsub of docUnsubs.values()) unsub();
      docUnsubs.clear();
      membersByUid.clear();
      rosterUids.clear();
    };
  }

  // ---- 방 메타 (이름/초대코드) 구독 ----
  function watchRoom_remote(roomId, cb) {
    if (!roomId) return () => {};
    let prevMemberCount = null;
    return db.collection("rooms").doc(roomId)
      .onSnapshot((d) => {
        if (!d.exists) { cb(null); return; }
        const data = d.data({ serverTimestamps: "estimate" });
        const count = data.memberCount || 0;
        if (prevMemberCount !== count) {
          prevMemberCount = count;
          triggerMemberRosterSync(roomId);
        }
        cb({
          id: d.id,
          ...data,
          createdAt: tsToMs(data.createdAt),
          recentClaps: Array.isArray(data.recentClaps) ? data.recentClaps : [],
        });
      });
  }

  // ---- (구) 방 문서 totalWorkSeconds — 미사용. 합계는 클라이언트가 멤버 workSecondsTotal 합산 ----
  async function addRoomWorkSeconds_remote() {}

  // ---- 박수 (사건성, 저빈도) ----
  async function sendClap_remote(roomId, fromUid, toUid) {
    if (!roomId || !fromUid || !toUid) return;
    const roomRef = db.collection("rooms").doc(roomId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      const data = snap.exists ? snap.data() : {};
      const recent = Array.isArray(data.recentClaps) ? data.recentClaps : [];
      const next = recent.concat([{ id: Math.random().toString(36).slice(2), fromUid, toUid, ts: Date.now() }]).slice(-20);
      tx.set(roomRef, { recentClaps: next }, { merge: true });
    });
  }
  // ===========================================================
  // 로컬 모드 — 같은 인터페이스, 메모리/localStorage 백업
  // ===========================================================
  const LOCAL_STORE_KEY = "todoary.room.localStore";
  let localState = null;
  const localSubs = { members: new Set(), room: new Set() };

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
      memberCount: 0, totalWorkSeconds: 0, createdAt: Date.now(), members: {}, recentClaps: [],
    };
    saveLocal();
    return { id, name, inviteCode: code };
  }
  async function findRoomByCode_local(code) {
    loadLocal();
    const inviteCode = normalizeInviteCode(code);
    const room = Object.values(localState.rooms).find((r) => r.inviteCode === inviteCode);
    return room ? { ...room } : null;
  }

  function resetLocalStore_local() {
    localState = { rooms: {} };
    try { localStorage.removeItem(LOCAL_STORE_KEY); } catch (_) {}
    saveLocal();
  }

  function makeDevMember(profile, uid, now, logOffsetMin) {
    const logs = (profile.recentLog || []).map((entry, i) => ({
      uid,
      nickname: profile.displayName,
      text: entry.text,
      todoPublic: !!entry.todoPublic,
      at: now - (logOffsetMin - i) * 4 * 60 * 1000,
    }));
    const working = profile.status === "working";
    return {
      displayName: profile.displayName,
      avatar: profile.avatar,
      status: profile.status || "idle",
      workStartedAt: working ? now - 18 * 60 * 1000 : null,
      accumulatedSecondsToday: working ? 2400 : 900,
      accumulatedDate: todayLocal(),
      workSecondsTotal: working ? 7200 : 3600,
      roomLevel: 2,
      lastLevelDay: todayLocal(),
      statusMessage: "조용히 작업 중",
      statusMessageAt: now - 6 * 60 * 1000,
      todoTotal: Math.max(1, (profile.visibleTodos || []).length),
      todoDone: 1,
      visibleTodos: profile.visibleTodos || [],
      recentLog: logs,
      lastActiveAt: now - 60 * 1000,
      joinedAt: now - 2 * 60 * 60 * 1000,
    };
  }

  function seedDevDemoRoom_local() {
    loadLocal();
    const meUid = getOrMakeLocalUid();
    const inviteCode = "DEV01";
    const now = Date.now();
    let room = Object.values(localState.rooms).find((r) => r.inviteCode === inviteCode);
    if (!room) {
      const id = "dev-room-main";
      localState.rooms[id] = {
        id,
        name: "[개발] 테스트 작업방",
        inviteCode,
        hostUid: meUid,
        memberCount: 0,
        createdAt: now,
        members: {},
        recentClaps: [],
        totalWorkSeconds: 0,
      };
      room = localState.rooms[id];
    }

    room.members[meUid] = makeDevMember({
      displayName: "나 (개발)",
      avatar: "🧑",
      status: "working",
      visibleTodos: [
        {
          title: "샘플 할 일 A",
          done: false,
          subTasks: [{ title: "세부 단계 1", done: true }],
        },
        { title: "샘플 할 일 B", done: true, subTasks: [] },
      ],
      recentLog: [{ text: "샘플 할 일 A을(를) 완료했어요.", todoPublic: true }],
    }, meUid, now, 30);

    const bots = (window.roomDevSandbox && window.roomDevSandbox.VIRTUAL_USERS) || [];
    bots.forEach((bot, i) => {
      room.members[bot.uid] = makeDevMember(bot, bot.uid, now, 50 - i * 10);
    });

    room.memberCount = Object.keys(room.members).length;
    room.recentClaps = [
      { id: "dev-clap-1", fromUid: "dev-bot-elda", toUid: meUid, ts: now - 3 * 60 * 1000 },
      { id: "dev-clap-2", fromUid: "dev-bot-fox", toUid: meUid, ts: now - 2 * 60 * 1000 },
      { id: "dev-clap-3", fromUid: "dev-bot-elda", toUid: meUid, ts: now - 90 * 1000 },
    ];
    saveLocal();
    fireLocalRoom(room.id);
    fireLocalMembers(room.id);
    try { localStorage.setItem("todoary.room.currentRoomId", room.id); } catch (_) {}
    return {
      ok: true,
      roomId: room.id,
      inviteCode,
      memberCount: room.memberCount,
    };
  }

  async function reinitBridge() {
    initPromise = null;
    app = null;
    auth = null;
    db = null;
    _uid = null;
    return init();
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
      avatar: fields.avatar ?? 22,
      status: "idle",
      workStartedAt: null,
      accumulatedSecondsToday: 0,
      accumulatedDate: todayLocal(),
      workSecondsTotal: 0,
      roomLevel: 0,
      lastLevelDay: null,
      statusMessage: "",
      statusMessageAt: null,
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
    const out = sanitizeMemberPatch(patch);
    if ("workStartedAt" in out) out.workStartedAt = out.workStartedAt ? Date.now() : null;
    room.members[uid] = { ...room.members[uid], ...out, lastActiveAt: Date.now() };
    saveLocal();
    fireLocalMembers(roomId);
  }
  async function updateMyMemberWithLog_local(roomId, uid, patch, logEntry) {
    loadLocal();
    const room = localState.rooms[roomId];
    if (!room || !room.members[uid]) return;
    const out = sanitizeMemberPatch(patch);
    if ("workStartedAt" in out) out.workStartedAt = out.workStartedAt ? Date.now() : null;
    if (logEntry && logEntry.text) {
      out.recentLog = (room.members[uid].recentLog || []).concat([{
        uid,
        nickname: logEntry.nickname || "이름없음",
        text: String(logEntry.text).slice(0, 160),
        todoPublic: !!logEntry.todoPublic,
        at: Date.now(),
      }]).slice(-50);
    }
    room.members[uid] = { ...room.members[uid], ...out, lastActiveAt: Date.now() };
    saveLocal();
    fireLocalMembers(roomId);
    fireLocalRoom(roomId);
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
  async function addRoomWorkSeconds_local() {
    /* no-op — 방 합계는 멤버 workSecondsTotal 클라이언트 합산 */
  }

  async function sendClap_local(roomId, fromUid, toUid) {
    loadLocal();
    const room = localState.rooms[roomId];
    if (!room) return;
    const clap = { id: Math.random().toString(36).slice(2), fromUid, toUid, ts: Date.now() };
    room.recentClaps = (room.recentClaps || []).concat([clap]).slice(-20);
    saveLocal();
    fireLocalRoom(roomId);
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
    dev: {
      isSandbox: isDevSandbox,
      reinit: reinitBridge,
      seedDemoRoom: () => (isLocal() ? seedDevDemoRoom_local() : { ok: false, error: "로컬 모드가 아닙니다" }),
      resetLocalStore: resetLocalStore_local,
    },
    rooms: {
      create: pick(createRoom_remote, createRoom_local),
      findByCode: pick(findRoomByCode_remote, findRoomByCode_local),
      join: pick(joinRoom_remote, joinRoom_local),
      leave: pick(leaveRoom_remote, leaveRoom_local),
      watch: pick(watchRoom_remote, watchRoom_local),
      addWorkSeconds: pick(addRoomWorkSeconds_remote, addRoomWorkSeconds_local),
    },
    members: {
      updateMine: pick(updateMyMember_remote, updateMyMember_local),
      updateMineWithLog: pick(updateMyMemberWithLog_remote, updateMyMemberWithLog_local),
      watch: pick(watchMembers_remote, watchMembers_local),
      exists: pick(memberExists_remote, memberExists_local),
    },
    claps: {
      send: pick(sendClap_remote, sendClap_local),
    },
  };
})();
