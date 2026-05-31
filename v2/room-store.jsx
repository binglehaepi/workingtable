/* global React, diary */
// ===========================================================
// room-store — 작업방 상태 관리 (React 훅 + 액션)
//
// 책임:
// • 현재 방 ID / 방 메타 / 멤버 리스트 / 박수 이벤트 보유
// • 방 만들기 / 입장 / 나가기 액션
// • 내 프로필(displayName, avatar) 영구 저장
// • 자기 자신의 todoDone/Total/workStartedAt 을 사건 단위로 서버에 반영 (room-sync.jsx 가 호출)
// ===========================================================

(function () {
  const PROFILE_KEY = "todoary.room.profile";
  const ROOM_ID_KEY = "todoary.room.currentRoomId";

  // 6자리 초대 코드 — 헷갈리는 문자 제외 (0/O, 1/I/L 제외)
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function makeInviteCode() {
    let s = "";
    for (let i = 0; i < 6; i++) {
      s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return s;
  }

  // 아바타 풀 — 동물 위주 (버디버디 미니미 느낌)
  const AVATARS = ["🐰", "🐱", "🐶", "🦊", "🐻", "🐼", "🐸", "🐧", "🐹", "🦝", "🐯", "🦁"];
  function randomAvatar() { return AVATARS[Math.floor(Math.random() * AVATARS.length)]; }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { displayName: "", avatar: randomAvatar() };
  }
  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (_) {}
  }

  function loadCurrentRoomId() {
    try { return localStorage.getItem(ROOM_ID_KEY) || null; } catch (_) { return null; }
  }
  function saveCurrentRoomId(id) {
    try {
      if (id) localStorage.setItem(ROOM_ID_KEY, id);
      else localStorage.removeItem(ROOM_ID_KEY);
    } catch (_) {}
  }

  // ---- 내 수동 상태 (working / away / paused) — localStorage 영속 ----
  // offline 은 자동만 (앱 종료 / heartbeat 끊김). 사용자가 직접 고를 수 없음.
  const MY_STATUS_KEY = "todoary.room.myStatus";
  const VALID_STATUSES = ["working", "away", "paused"];
  function loadMyStatus() {
    try {
      const v = localStorage.getItem(MY_STATUS_KEY);
      return VALID_STATUSES.includes(v) ? v : "working";
    } catch (_) { return "working"; }
  }
  function saveMyStatus(s) {
    try { localStorage.setItem(MY_STATUS_KEY, s); } catch (_) {}
  }

  // ---- 글로벌 상태 (pub/sub) ----
  let state = {
    bridgeStatus: "idle",        // 'idle' | 'loading' | 'ready' | 'local' | 'error'
    bridgeError: null,
    profile: loadProfile(),
    myStatus: loadMyStatus(),    // 'working' | 'away' | 'paused' — 수동 사용자 설정
    currentRoomId: loadCurrentRoomId(),
    roomMeta: null,              // { id, name, inviteCode, ... }
    members: [],                 // [{ uid, displayName, avatar, status, workStartedAt, ... }]
    recentClaps: [],             // [{ id, fromUid, toUid, ts }]  — 최근 60초만 유지
    initialized: false,
  };
  const subs = new Set();
  function setS(patch) {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    for (const fn of subs) { try { fn(state); } catch (_) {} }
  }
  function getS() { return state; }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  // ---- 구독 핸들 — 방이 바뀌면 끊고 다시 붙임 ----
  let unsubMembers = null;
  let unsubRoom = null;
  let unsubClaps = null;
  let clapsSince = Date.now();

  function detachAll() {
    if (unsubMembers) { unsubMembers(); unsubMembers = null; }
    if (unsubRoom) { unsubRoom(); unsubRoom = null; }
    if (unsubClaps) { unsubClaps(); unsubClaps = null; }
  }

  function attachToRoom(roomId) {
    detachAll();
    if (!roomId) {
      setS({ roomMeta: null, members: [], recentClaps: [] });
      return;
    }
    const fb = window.firebaseBridge;
    unsubRoom = fb.rooms.watch(roomId, (meta) => {
      setS({ roomMeta: meta });
      // 방이 사라졌으면 자동으로 나가기 상태
      if (!meta) {
        saveCurrentRoomId(null);
        setS({ currentRoomId: null, members: [], recentClaps: [] });
        detachAll();
      }
    });
    unsubMembers = fb.members.watch(roomId, (members) => {
      // 멤버 도착 → 완료 이벤트 디텍션은 다른 곳에서
      setS({ members });
    });
    clapsSince = Date.now() - 5000; // 최근 5초 이내 박수도 잡힐 수 있게 살짝 과거부터
    unsubClaps = fb.claps.watchRecent(roomId, clapsSince, (clap) => {
      // 60초 안 박수만 유지
      const now = Date.now();
      setS((s) => ({
        recentClaps: [...s.recentClaps.filter((c) => now - c.ts < 60000), clap],
      }));
      // 60초 후 자동 제거 트리거
      setTimeout(() => {
        setS((s) => ({ recentClaps: s.recentClaps.filter((c) => c.id !== clap.id) }));
      }, 60000);
    });
  }

  // ---- 부팅 (idempotent) ----
  let bootstrapPromise = null;
  function bootstrap() {
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      const fb = window.firebaseBridge;
      if (!fb) {
        setS({ bridgeStatus: "error", bridgeError: new Error("firebase-bridge not loaded"), initialized: true });
        return;
      }
      fb.subscribeStatus((s, err) => setS({ bridgeStatus: s, bridgeError: err }));
      setS({ bridgeStatus: fb.getStatus() });
      await fb.init();
      setS({ initialized: true });
      // 저장된 방 ID가 있는데 멤버 문서가 없으면(UID 변경 등) 로컬만 정리
      const savedId = state.currentRoomId;
      if (savedId && fb.isReady()) {
        try {
          const ok = await fb.members.exists(savedId, fb.uid());
          if (!ok) {
            saveCurrentRoomId(null);
            setS({ currentRoomId: null, roomMeta: null, members: [] });
            detachAll();
          }
        } catch (_) {}
      }
    })();
    return bootstrapPromise;
  }

  // ---- 액션 ----
  async function createRoom({ name }) {
    const fb = window.firebaseBridge;
    if (!fb || (fb.getStatus() !== "ready" && fb.getStatus() !== "local")) {
      throw new Error("아직 준비 중이에요");
    }
    const code = makeInviteCode();
    const hostUid = fb.uid();
    const room = await fb.rooms.create({ name, hostUid, code });
    // 본인을 멤버로 등록
    await fb.rooms.join(room.id, hostUid, {
      displayName: state.profile.displayName || "나",
      avatar: state.profile.avatar || randomAvatar(),
    });
    saveCurrentRoomId(room.id);
    setS({ currentRoomId: room.id });
    return room;
  }

  async function joinByCode(code) {
    const fb = window.firebaseBridge;
    if (!fb || (fb.getStatus() !== "ready" && fb.getStatus() !== "local")) {
      throw new Error("아직 준비 중이에요");
    }
    const normalized = (code || "").trim().toUpperCase();
    if (!normalized) throw new Error("INVALID_CODE");
    const room = await fb.rooms.findByCode(normalized);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    await fb.rooms.join(room.id, fb.uid(), {
      displayName: state.profile.displayName || "나",
      avatar: state.profile.avatar || randomAvatar(),
    });
    saveCurrentRoomId(room.id);
    setS({ currentRoomId: room.id });
    return room;
  }

  async function leaveRoom() {
    const fb = window.firebaseBridge;
    const id = state.currentRoomId;
    if (!id) return;
    // UI는 서버 응답을 기다리지 않고 즉시 빠져나옴 (나가기 버튼 무반응 방지)
    detachAll();
    saveCurrentRoomId(null);
    setS({ currentRoomId: null, roomMeta: null, members: [], recentClaps: [] });
    if (!fb || !fb.uid()) return;
    try {
      await fb.rooms.leave(id, fb.uid());
    } catch (e) {
      try { console.warn("[room] leave remote failed (local cleared)", e); } catch (_) {}
    }
  }

  function setProfile(patch) {
    const next = { ...state.profile, ...patch };
    saveProfile(next);
    setS({ profile: next });
    // 방에 들어와 있으면 본인 멤버 문서도 갱신 (사건 단위)
    const fb = window.firebaseBridge;
    if (fb && state.currentRoomId && fb.uid()) {
      fb.members.updateMine(state.currentRoomId, fb.uid(), {
        displayName: next.displayName || "나",
        avatar: next.avatar,
      }).catch(() => {});
    }
  }

  // 내 상태 수동 전환 — UI 가 호출. 로컬 즉시 반영 (시각 반응 즉시).
  // 서버 쓰기는 useRoomSync effect 가 처리 (status + workStartedAt 정리를 한 patch 로
  // 묶어 500ms 디바운스 → 토글 1번 = 서버 쓰기 1번)
  function setMyStatus(next) {
    if (!VALID_STATUSES.includes(next)) return;
    if (state.myStatus === next) return;
    saveMyStatus(next);
    setS({ myStatus: next });
  }

  function sendClap(toUid) {
    const fb = window.firebaseBridge;
    if (!fb || !state.currentRoomId || !fb.uid() || !toUid) return;
    fb.claps.send(state.currentRoomId, fb.uid(), toUid).catch(() => {});
  }

  // ---- 내 멤버 데이터 사건 업데이트 (room-sync 에서 호출) ----
  // 500ms 디바운스로 묶음 — 토글 연타나 동시 변경을 한 번의 write 로 합침.
  // 빈 patch (heartbeat) 는 디바운스 없이 즉시.
  const PATCH_DEBOUNCE_MS = 500;
  let pendingPatch = null;
  let pendingTimer = null;
  function patchMyMember(patch) {
    const fb = window.firebaseBridge;
    if (!fb || !state.currentRoomId || !fb.uid()) return;
    if (!patch || Object.keys(patch).length === 0) {
      const merged = { ...(pendingPatch || {}) };
      pendingPatch = null;
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
      fb.members.updateMine(state.currentRoomId, fb.uid(), merged).catch(() => {});
      return;
    }
    pendingPatch = { ...(pendingPatch || {}), ...patch };
    if (pendingTimer) return;
    pendingTimer = setTimeout(() => {
      const toSend = pendingPatch || {};
      pendingPatch = null;
      pendingTimer = null;
      if (Object.keys(toSend).length === 0) return;
      fb.members.updateMine(state.currentRoomId, fb.uid(), toSend).catch(() => {});
    }, PATCH_DEBOUNCE_MS);
  }

  // ---- React 훅 ----
  function useRoom() {
    const [, tick] = React.useState(0);
    React.useEffect(() => subscribe(() => tick((x) => x + 1)), []);
    return {
      state,
      bootstrap,
      createRoom,
      joinByCode,
      leaveRoom,
      setProfile,
      setMyStatus,
      sendClap,
      patchMyMember,
      avatars: AVATARS,
      randomAvatar,
    };
  }

  window.roomStore = {
    useRoom, subscribe, getS,
    bootstrap, createRoom, joinByCode, leaveRoom, setProfile, setMyStatus, sendClap, patchMyMember,
    attachToRoom, detachAll,
    AVATARS, randomAvatar, makeInviteCode,
  };
})();
