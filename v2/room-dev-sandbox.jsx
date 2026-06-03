/* global React */
// ===========================================================
// 작업방 개발 샌드박스 — 이 PC/localStorage 전용 (운영 Firestore 미사용)
//
// 켜기: 콘솔 roomDevSandbox.enable()
// ===========================================================

(function () {
  const FLAG_KEY = "todoary.room.devSandbox";
  const STORE_KEY = "todoary.room.localStore";

  const VIRTUAL_USERS = [
    {
      uid: "dev-bot-elda",
      displayName: "엘다",
      avatar: "🐱",
      status: "working",
      visibleTodos: [
        {
          title: "API 문서 정리",
          done: false,
          subTasks: [{ title: "목차 정리", done: true }, { title: "예시 코드", done: false }],
        },
        { title: "테스트 시나리오 작성", done: false, subTasks: [] },
      ],
      recentLog: [
        { text: "API 문서 정리을(를) 완료했어요.", todoPublic: true },
        { text: "박수 보내기", todoPublic: false },
        { text: "박수 보내기", todoPublic: false },
      ],
    },
    {
      uid: "dev-bot-fox",
      displayName: "여우",
      avatar: "🦊",
      status: "away",
      visibleTodos: ["디자인 시안 검토"],
      recentLog: [
        { text: "디자인 시안 검토을(를) 완료했어요.", todoPublic: true },
      ],
    },
    {
      uid: "dev-bot-bear",
      displayName: "곰",
      avatar: "🐻",
      status: "paused",
      visibleTodos: ["이메일 답장", "주간 회고"],
      recentLog: [
        { text: "박수 보내기", todoPublic: false },
      ],
    },
  ];

  function isEnabled() {
    try { return localStorage.getItem(FLAG_KEY) === "1"; } catch (_) { return false; }
  }

  function enable() {
    try { localStorage.setItem(FLAG_KEY, "1"); } catch (_) {}
  }

  function disable() {
    try { localStorage.removeItem(FLAG_KEY); } catch (_) {}
  }

  function todayYmd() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${dd}`;
  }

  function makeMember(uid, profile, now, offsetMin) {
    const logs = (profile.recentLog || []).map((entry, i) => ({
      uid,
      nickname: profile.displayName,
      text: entry.text,
      todoPublic: !!entry.todoPublic,
      at: now - (offsetMin - i) * 4 * 60 * 1000,
    }));
    const working = profile.status === "working";
    return {
      displayName: profile.displayName,
      avatar: profile.avatar,
      status: profile.status || "idle",
      workStartedAt: working ? now - 18 * 60 * 1000 : null,
      accumulatedSecondsToday: working ? 2400 : 900,
      accumulatedDate: todayYmd(),
      workSecondsTotal: working ? 7200 : 3600,
      roomLevel: 2,
      lastLevelDay: todayYmd(),
      statusMessage: "조용히 작업 중",
      statusMessageAt: now - 6 * 60 * 1000,
      todoTotal: (profile.visibleTodos || []).length + 1,
      todoDone: 1,
      visibleTodos: profile.visibleTodos || [],
      recentLog: logs,
      lastActiveAt: now - 60 * 1000,
      joinedAt: now - 2 * 60 * 60 * 1000,
    };
  }

  /** 로컬 모드 전용 — firebase-bridge 내부 store 직접 채움 */
  function seedDemoRoom() {
    const fb = window.firebaseBridge;
    if (!fb || !fb.isLocal()) {
      return { ok: false, error: "로컬(샌드박스) 모드에서만 사용할 수 있어요. 설정에서 개발 샌드박스를 켜 주세요." };
    }
    const r = fb.dev.seedDemoRoom();
    if (r.ok && window.roomStore && window.roomStore.openRoom) {
      window.roomStore.openRoom(r.roomId);
    }
    return r;
  }

  function resetLocalRoomData() {
    const fb = window.firebaseBridge;
    if (fb && fb.dev && fb.dev.resetLocalStore) {
      fb.dev.resetLocalStore();
      return { ok: true };
    }
    try {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem("todoary.room.currentRoomId");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async function applySandboxToggle(on) {
    if (on) enable();
    else disable();
    const fb = window.firebaseBridge;
    if (fb && fb.dev && fb.dev.reinit) {
      await fb.dev.reinit();
    }
    if (window.roomStore && window.roomStore.bootstrap) {
      await window.roomStore.bootstrap();
    }
    return on;
  }

  window.roomDevSandbox = {
    FLAG_KEY,
    VIRTUAL_USERS,
    isEnabled,
    enable: () => applySandboxToggle(true),
    disable: () => applySandboxToggle(false),
    seedDemoRoom,
    resetLocalRoomData,
  };

  // ---- 설정 탭용 UI ----
  const { useState, useEffect } = React;

  function RoomDevSandboxPanel() {
    const [on, setOn] = useState(isEnabled());
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);
    const bridge = window.firebaseBridge;
    const bridgeLabel = bridge
      ? (bridge.isLocal() ? "로컬 샌드박스" : bridge.isReady() ? "Firestore 연결됨" : bridge.getStatus())
      : "—";

    useEffect(() => {
      if (!bridge || !bridge.subscribeStatus) return;
      return bridge.subscribeStatus(() => setOn(isEnabled()));
    }, [bridge]);

    const run = async (fn) => {
      setBusy(true);
      setMsg("");
      try {
        const r = await fn();
        if (r && r.error) setMsg(r.error);
        else if (r && r.inviteCode) {
          setMsg(`데모 방 준비됨 · 코드 ${r.inviteCode} · 멤버 ${r.memberCount}명`);
        } else setMsg(r && r.ok === false ? (r.error || "실패") : "완료");
      } catch (e) {
        setMsg(e && e.message ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="sk-cap" style={{ fontSize: 11, lineHeight: 1.45, color: "var(--ink-2)" }}>
          이 PC의 localStorage만 사용합니다. 운영 Firebase에는 읽기/쓰기하지 않습니다.
          <br />상태: <strong>{bridgeLabel}</strong>
          {on ? " · 샌드박스 ON" : ""}
        </div>
        <SetSeg
          value={on ? "on" : "off"}
          onChange={(v) => run(async () => {
            await applySandboxToggle(v === "on");
            setOn(v === "on");
            return { ok: true };
          })}
          options={[["on", "ON (로컬+가상 유저)"], ["off", "OFF (Firebase)"]]}
        />
        <button
          disabled={busy || !on}
          onClick={() => run(async () => seedDemoRoom())}
          style={devBtnStyle}
        >
          데모 방 + 가상 멤버 3명 채우기
        </button>
        <button
          disabled={busy}
          onClick={() => run(async () => {
            resetLocalRoomData();
            if (window.roomStore && window.roomStore.leaveRoom) {
              await window.roomStore.leaveRoom();
            }
            return { ok: true };
          })}
          style={{ ...devBtnStyle, background: "var(--paper-2)", color: "var(--ink)" }}
        >
          로컬 작업방 데이터 초기화
        </button>
        {msg && (
          <div className="sk-cap" style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.4 }}>{msg}</div>
        )}
        <div className="sk-cap" style={{ fontSize: 10, color: "var(--ink-3)" }}>
          가상 유저: {VIRTUAL_USERS.map((u) => u.displayName).join(", ")}
          <br />콘솔: <code style={{ fontFamily: "var(--mono)" }}>roomDevSandbox.seedDemoRoom()</code>
        </div>
      </div>
    );
  }

  const devBtnStyle = {
    all: "unset",
    cursor: "pointer",
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "center",
    padding: "8px 12px",
    borderRadius: 10,
    border: "1.1px solid var(--ink)",
    background: "var(--hi)",
    fontFamily: "var(--hand)",
    fontWeight: 700,
    fontSize: 13,
    color: "var(--ink)",
    opacity: 1,
  };

  window.RoomDevSandboxPanel = RoomDevSandboxPanel;
})();
