/* global React, diary, SpriteIcon, buildBackground */
// ===========================================================
// 작업방 (함께 작업방) — 메인 뷰
//
// 철학:
//  • "조용히 옆에 누가 같이 일하고 있는 느낌" (body doubling) — 통화/채팅/푸시 없음
//  • 흐르는 시간은 클라이언트가 workStartedAt 기준으로 매초 계산 (서버 비용 0)
//  • 오프라인은 회색 카드로 남김 (감시 X, 따뜻한 느낌 O)
//
// 구조:
//  RoomView
//    ├ Loading
//    ├ EmptyRoomView   (방 만들기 / 초대 코드로 들어가기)
//    └ RoomMainView    (헤더 + 멤버 카드 N개 + 빈 슬롯 + 하단 합계 바)
// ===========================================================
const { useState: useStateRoom, useEffect: useEffectRoom, useRef: useRefRoom } = React;

// ---- 로컬 유틸 ----
function fmtHMS(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtHM(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtRoomClock(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? L("time.am") : L("time.pm");
  const h12 = ((h + 11) % 12) + 1;
  return `${ampm} ${h12}:${m}`;
}

// 오프라인 판정 — 마지막 활동 5분 초과
function isMemberOffline(m, now) {
  if (!m.lastActiveAt) return true;
  return (now - m.lastActiveAt) > 5 * 60 * 1000;
}

// 멤버의 현재 누적 작업시간(초) — 로컬 계산.
// 본인 commit 못 한 채로 끊기면 (앱 강제 종료 / 통신 끊김) lastActiveAt 을
// cutoff 로 사용해서 다른 멤버 화면에서도 시계가 마지막 heartbeat 시점에 멈추도록.
// paused 상태도 동일 — workStartedAt 이 null 이라 acc 만 보여줌.
function memberLiveSeconds(m, now) {
  const acc = m.accumulatedSecondsToday || 0;
  if (!m.workStartedAt) return acc;
  // 오프라인(heartbeat 5분 초과)이면 lastActiveAt 까지만 카운트
  const off = isMemberOffline(m, now);
  const cutoff = off ? Math.min(m.lastActiveAt || m.workStartedAt, now) : now;
  if (cutoff <= m.workStartedAt) return acc;
  return acc + Math.floor((cutoff - m.workStartedAt) / 1000);
}
function roomAvatarIdx(value) {
  return Number.isInteger(value) && value >= 0 && value < 24 ? value : 22;
}
function RoomAvatarIcon({ value, size = 24 }) {
  return <SpriteIcon idx={roomAvatarIdx(value)} size={size} />;
}
function visibleTodoTitle(item) {
  if (typeof item === "string") return item;
  if (item && typeof item.title === "string") return item.title;
  return "";
}
function visibleTodoDone(item) {
  return typeof item === "object" && item ? !!item.done : false;
}
function roomTodoView(item, id) {
  return { id, title: visibleTodoTitle(item), done: visibleTodoDone(item) };
}
function memberRoomStatus(member, now, myUid, myStatus) {
  if (member.uid === myUid && myStatus === "away") return "away";
  if (isMemberOffline(member, now)) return "offline";
  if (member.status === "paused") return "paused";
  if (member.status === "away") return "away";
  if (member.workStartedAt) return "working";
  return "online";
}
function roomStatusText(status) {
  if (status === "away") return L("room.statusAwayLog");
  if (status === "offline") return L("room.statusOfflineLog");
  if (status === "online" || status === "working") return L("room.statusOnlineLog");
  if (status === "paused") return L("room.statusPausedLog");
  return "";
}
function shouldLogRoomStatusChange(uid, myUid, prev, next) {
  if (!prev || prev === next) return false;
  // 내 자동 온라인/오프라인은 재접속·pending timestamp 때 흔들릴 수 있어 로그로 쌓지 않는다.
  if (uid === myUid && (prev === "online" || prev === "working" || prev === "offline") && (next === "online" || next === "working" || next === "offline")) {
    return false;
  }
  return true;
}
const STATUS_EVENT_COALESCE_MS = 30000;
const NOTICE_VISIBLE_MS = 7000;
function mergeRoomStatusEvents(events, added) {
  let next = [...events];
  added.forEach((ev) => {
    let idx = -1;
    for (let i = next.length - 1; i >= 0; i--) {
      const old = next[i];
      if (old.kind === "status" && old.uid === ev.uid && ev.at - old.at < STATUS_EVENT_COALESCE_MS) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) next[idx] = ev;
    else next.push(ev);
  });
  return next.slice(-50);
}
function roomThemeBackground(tweaks) {
  if (typeof buildBackground !== "function") {
    return "linear-gradient(180deg, var(--paper-2) 0%, var(--paper) 100%)";
  }
  return buildBackground(
    tweaks?.bgType ?? "linear",
    tweaks?.bgAngle ?? 180,
    tweaks?.bgStops ?? [{ c: "#a9cdf5", p: 0 }, { c: "#ffffff", p: 100 }],
    tweaks?.bgShape ?? "none"
  );
}

// ---- 1초마다 리렌더 트리거 (작업시간 표시용) ----
function useNowTick() {
  const [now, setNow] = useStateRoom(Date.now());
  useEffectRoom(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ===========================================================
// 최상위 RoomView
// ===========================================================
function RoomView({ tweaks } = {}) {
  const room = window.roomStore.useRoom();
  useI18n();

  // 부팅 — 마운트 시 1회
  useEffectRoom(() => { room.bootstrap(); }, []);

  // 탭 진입 시 watch 붙이기 / 이탈 시 떼기 (Firestore 읽기 비용 최소화)
  const roomId = room.state.currentRoomId;
  const status = room.state.bridgeStatus;
  useEffectRoom(() => {
    if (!roomId || (status !== "ready" && status !== "local")) return;
    window.roomStore.attachToRoom(roomId);
    return () => window.roomStore.detachAll();
  }, [roomId, status]);

  // (Self → 서버 동기화는 RoomSyncBridge 에서 항상 실행 — 다른 탭에서 토글해도 반영)

  const bs = room.state.bridgeStatus;

  if (bs === "idle" || bs === "loading") {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="sk-cap" style={{ fontSize: 14 }}>{L("room.connecting")}</div>
      </div>
    );
  }

  if (!room.state.currentRoomId) {
    return <EmptyRoomView tweaks={tweaks} />;
  }
  return <RoomMainView tweaks={tweaks} />;
}

// ===========================================================
// 빈 상태 — 방 만들기 / 초대 코드 입장
// ===========================================================
function EmptyRoomView({ tweaks } = {}) {
  const room = window.roomStore.useRoom();
  const { state: ds } = diary.useDiary();
  const themeBg = roomThemeBackground(tweaks);
  const [mode, setMode] = useStateRoom(null);  // null | 'create' | 'join'
  const [name, setName] = useStateRoom("");
  const [code, setCode] = useStateRoom("");
  const [err, setErr] = useStateRoom("");
  const [busy, setBusy] = useStateRoom(false);
  const [profileOpen, setProfileOpen] = useStateRoom(false);
  const isLocal = room.state.bridgeStatus === "local";

  // 미리보기용 본인 todo 리스트 — RoomMainView 와 동일 로직
  const today = diary.today();
  const myTodos = (ds.todos || [])
    .filter((t) => t.projectId === ds.currentProjectId)
    .filter((t) => {
      if (!t.dueDate) return true;
      if (t.dueDate === today) return true;
      if (t.dueDate < today && !t.done) return true;
      return false;
    })
    .slice()
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });

  const submit = async (nextMode = mode) => {
    setErr(""); setBusy(true);
    try {
      if (nextMode === "create") {
        await room.createRoom({ name: name.trim() || L("room.title") });
      } else if (nextMode === "join") {
        await room.joinByCode(code.trim());
      }
    } catch (e) {
      const m = e && e.message;
      if (m === "ROOM_FULL") setErr(L("room.full"));
      else if (m === "ROOM_NOT_FOUND") setErr(L("room.notFound"));
      else if (m === "INVALID_CODE") setErr(L("room.codeInvalid"));
      else setErr(m || L("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      padding: "18px 16px", gap: 10, boxSizing: "border-box", overflowY: "auto",
      background: themeBg,
      backgroundSize: "200% 200%",
      backgroundPosition: "center",
    }}>
      {isLocal && <LocalModeBanner />}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--hand)", fontSize: 18, fontWeight: 800, color: "var(--ink)", letterSpacing: "0.01em" }}>
          {L("room.emptyTitle")}
        </div>
        <div className="sk-cap" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-line" }}>
          {L("room.emptyHint")}
        </div>
      </div>

      <div style={{
        border: "1.1px solid var(--ink)",
        borderRadius: 4,
        background: "color-mix(in srgb, var(--paper) 88%, var(--blue-soft))",
        boxShadow: "3px 3px 0 color-mix(in srgb, var(--ink-soft) 70%, transparent)",
        overflow: "hidden",
      }}>
        <div style={{
          height: 28,
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 8px",
          background: "linear-gradient(180deg, color-mix(in srgb, var(--paper) 42%, var(--point)), color-mix(in srgb, var(--paper) 64%, var(--point)))",
          borderBottom: "1.1px solid var(--ink)",
          color: "var(--ink)",
          fontFamily: "var(--hand)", fontWeight: 800, fontSize: 14,
        }}>
          <span>♡</span>
          <span style={{ flex: 1 }}>{L("room.title")}</span>
          <button onClick={() => setProfileOpen((v) => !v)} style={{
            all: "unset", cursor: "pointer",
            width: 18, height: 18,
            display: "grid", placeItems: "center",
            background: "var(--paper)",
            border: "1px solid var(--ink)",
            color: "var(--ink)",
            fontFamily: "var(--mono)", fontSize: 12,
          }}>×</button>
        </div>
        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          <RoomEntryScene
            profile={room.state.profile}
            todoCount={myTodos.length}
            doneCount={myTodos.filter((t) => t.done).length}
            onProfileClick={() => setProfileOpen((v) => !v)}
          />
          <div style={{ display: "grid", gap: 7 }}>
            <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)" }}>{L("room.roomNameLabel")}</span>
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder={L("room.namePh")}
                onKeyDown={(e) => { if (e.key === "Enter") { setMode("create"); submit("create"); } }}
                style={{ ...formInput, height: 28, borderColor: "var(--ink)" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)" }}>{L("room.inviteCodeLabel")}</span>
              <input
                value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={L("room.codePh")}
                maxLength={6}
                onKeyDown={(e) => { if (e.key === "Enter") { setMode("join"); submit("join"); } }}
                style={{ ...formInput, height: 28, borderColor: "var(--ink)", fontFamily: "var(--mono)", letterSpacing: "0.12em", textAlign: "center" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
              <button onClick={() => { setMode("create"); submit("create"); }} disabled={busy} style={{ ...bigBtn, padding: "8px", background: "color-mix(in srgb, var(--paper) 82%, var(--pink-soft))", opacity: busy ? 0.5 : 1 }}>
                ＋ {L("room.create")}
              </button>
              <button onClick={() => { setMode("join"); submit("join"); }} disabled={busy || code.length < 4} style={{ ...bigBtn, padding: "8px", background: "color-mix(in srgb, var(--paper) 82%, var(--blue-soft))", opacity: (busy || code.length < 4) ? 0.5 : 1 }}>
                ✉ {L("room.join")}
              </button>
            </div>
          </div>
          {err && <div className="sk-cap" style={{ color: "var(--bad)", textAlign: "center" }}>{err}</div>}
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "52px 1fr",
          borderTop: "1.1px solid var(--ink)",
          background: "color-mix(in srgb, var(--paper) 84%, var(--pink-soft))",
        }}>
          <div style={{
            display: "grid", placeItems: "center",
            borderRight: "1.1px solid var(--ink)",
            fontSize: 28,
            color: "var(--point)",
          }}>♥</div>
          <div style={{
            padding: "8px 10px",
            fontFamily: "var(--hand)", fontSize: 15, fontWeight: 800,
            color: "var(--point)",
            textShadow: "0 1px 0 var(--paper)",
          }}>{L("room.tagline")}</div>
        </div>
        <div style={{
          padding: "7px 10px",
          borderTop: "1.1px solid var(--ink)",
          background: "color-mix(in srgb, var(--paper) 90%, transparent)",
          fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink-2)",
        }}>{L("room.profileHint")}</div>
      </div>

      <div className="sk-cap" style={{ textAlign: "center", lineHeight: 1.45, padding: "0 8px" }}>
        {L("room.description")}
      </div>

      <div style={{
        padding: "9px 11px",
        border: "1.1px dashed var(--ink)",
        borderRadius: 10,
        background: "color-mix(in srgb, var(--paper) 84%, var(--cream-soft))",
        fontFamily: "var(--hand)",
        fontSize: 12.5,
        lineHeight: 1.45,
        color: "var(--ink-2)",
      }}>
        <div style={{ fontWeight: 800, color: "var(--ink)", marginBottom: 3 }}>{L("room.betaTitle")}</div>
        {L("room.betaBody", { email: "dinglediary@gmail.com" })}
      </div>

      {profileOpen && (
        <div style={{ marginTop: -4 }}>
          <RoomEntryProfilePanel />
        </div>
      )}
    </div>
  );
}

function RoomEntryScene({ profile, todoCount, doneCount, onProfileClick }) {
  const progress = todoCount > 0 ? Math.min(1, doneCount / todoCount) : 0;
  return (
    <div style={{
      position: "relative",
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "18px 16px 48px",
      boxSizing: "border-box",
      border: "1.1px solid var(--ink)",
      borderRadius: 16,
      overflow: "hidden",
      background: "color-mix(in srgb, var(--paper) 84%, transparent)",
      boxShadow: "0 3px 0 var(--paper-3)",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `
          radial-gradient(circle at 50% 44%, color-mix(in srgb, var(--hi) 22%, transparent), transparent 34%),
          linear-gradient(180deg, color-mix(in srgb, var(--blue-soft) 38%, transparent), transparent 62%)
        `,
        opacity: 0.95,
      }} />
      <div style={{
        position: "relative",
        zIndex: 1,
        display: "grid",
        placeItems: "center",
        gap: 8,
      }}>
        <button onClick={onProfileClick} title={L("room.profileSettings")} style={{
          all: "unset",
          cursor: "pointer",
          width: 86,
          minHeight: 102,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          border: "1.1px solid var(--ink)",
          borderRadius: 16,
          background: "color-mix(in srgb, var(--paper) 90%, transparent)",
          boxShadow: "0 4px 0 color-mix(in srgb, var(--ink-soft) 70%, transparent)",
        }}>
          <span style={{
            width: 54, height: 54,
            borderRadius: 14,
            border: "1.1px solid var(--ink)",
            background: "var(--paper)",
            display: "grid",
            placeItems: "center",
          }}>
            <RoomAvatarIcon value={profile.avatar} size={36} />
          </span>
          <span style={{
            maxWidth: 72,
            fontFamily: "var(--hand)", fontSize: 12.5, fontWeight: 800,
            color: "var(--ink)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{profile.displayName || L("room.you")}</span>
        </button>
        <div className="sk-cap" style={{ fontSize: 11.5, textAlign: "center" }}>
          {L("room.profileHintShort")}
        </div>
      </div>
      <div style={{
        position: "absolute", left: 14, right: 14, bottom: 12,
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 9px",
        border: "1.1px solid var(--ink)",
        borderRadius: 10,
        background: "color-mix(in srgb, var(--paper) 82%, transparent)",
        fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink-2)",
      }}>
        <span style={{ fontWeight: 700, color: "var(--ink)" }}>{L("room.todayReady")}</span>
        <span style={{ flex: 1, height: 7, borderRadius: 99, border: "1px solid var(--ink)", background: "var(--paper)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${progress * 100}%`, background: "linear-gradient(90deg, var(--point), var(--hi))" }} />
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{doneCount}/{todoCount}</span>
      </div>
    </div>
  );
}

function RoomEntryProfilePanel() {
  const room = window.roomStore.useRoom();
  const [name, setName] = useStateRoom(room.state.profile.displayName || "");
  return (
    <div style={{
      padding: 10,
      border: "1.1px solid var(--ink)",
      borderRadius: 12,
      background: "color-mix(in srgb, var(--paper) 82%, transparent)",
      boxShadow: "0 2px 0 var(--paper-3)",
    }}>
      <div className="sk-label" style={{ marginBottom: 8 }}>{L("room.profileSettings")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 36, height: 36, border: "1.1px solid var(--ink)", borderRadius: 10, background: "var(--paper)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <RoomAvatarIcon value={room.state.profile.avatar} size={24} />
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => room.setProfile({ displayName: name.trim() })}
          placeholder={L("room.namePrompt")}
          style={{ ...formInput, flex: 1 }}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {room.avatars.map((a) => (
          <button key={a} onClick={() => room.setProfile({ avatar: a })}
            style={{
              ...avatarBtn, width: 30, height: 30,
              borderRadius: 8,
              background: room.state.profile.avatar === a ? "var(--hi)" : "var(--paper)",
            }}><RoomAvatarIcon value={a} size={20} /></button>
        ))}
      </div>
    </div>
  );
}

// ===========================================================
// 메인 뷰 — 방 안에 있을 때 (4분할 그리드)
// ===========================================================
function RoomMainView({ tweaks } = {}) {
  const room = window.roomStore.useRoom();
  const { state: ds } = diary.useDiary();
  const now = useNowTick();
  const { roomMeta, members } = room.state;
  const recentClaps = roomMeta?.recentClaps || [];
  const themeBg = roomThemeBackground(tweaks);
  const myUid = window.firebaseBridge.uid();
  const nameByUid = new Map(members.map((m) => [m.uid, m.displayName || L("room.friend")]));
  const [statusEvents, setStatusEvents] = useStateRoom([]);
  const prevStatusesRef = useRefRoom(new Map());
  const statusSig = members
    .map((m) => `${m.uid}:${memberRoomStatus(m, now, myUid, room.state.myStatus)}`)
    .join("|");
  useEffectRoom(() => {
    if (!members.length) return;
    const prevMap = prevStatusesRef.current;
    const nextMap = new Map();
    const added = [];
    members.forEach((m) => {
      const status = memberRoomStatus(m, now, myUid, room.state.myStatus);
      nextMap.set(m.uid, status);
      const prev = prevMap.get(m.uid);
      if (!shouldLogRoomStatusChange(m.uid, myUid, prev, status)) return;
      const text = roomStatusText(status);
      if (!text) return;
      added.push({
        id: `status-${m.uid}-${now}`,
        kind: "status",
        uid: m.uid,
        nickname: m.displayName || (m.uid === myUid ? L("room.you") : L("room.friend")),
        text,
        at: now,
      });
    });
    prevStatusesRef.current = nextMap;
    if (added.length) setStatusEvents((events) => mergeRoomStatusEvents(events, added));
  }, [statusSig]);
  const completionLog = members
    .flatMap((m) => Array.isArray(m.recentLog) ? m.recentLog : []);
  const clapLog = recentClaps.map((c) => ({
    id: c.id || `clap-${c.fromUid}-${c.toUid}-${c.ts}`,
    kind: "clap",
    uid: c.fromUid,
    nickname: nameByUid.get(c.fromUid) || L("room.friend"),
    text: L("room.clapHint"),
    at: c.ts,
  }));
  const roomLog = [...completionLog, ...clapLog, ...statusEvents]
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-50);
  const noticeByUid = new Map();
  roomLog.forEach((ev) => {
    if (!ev?.uid || !ev?.text || now - (ev.at || 0) > NOTICE_VISIBLE_MS) return;
    noticeByUid.set(ev.uid, ev);
  });
  const isLocal = room.state.bridgeStatus === "local";

  // 본인 todo 리스트 — diary 직접 (자기 카드에서만 보임)
  const today = diary.today();
  const myTodos = (ds.todos || [])
    .filter((t) => t.projectId === ds.currentProjectId)
    .filter((t) => {
      if (!t.dueDate) return true;
      if (t.dueDate === today) return true;
      if (t.dueDate < today && !t.done) return true;
      return false;
    })
    .slice()
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });

  // 멤버 정렬: 나 먼저, 그 다음 입장 순
  const sorted = [...members].sort((a, b) => {
    if (a.uid === myUid) return -1;
    if (b.uid === myUid) return 1;
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });

  const onlineCount = members.filter((m) => !isMemberOffline(m, now)).length;
  const totalSeconds = members.reduce((sum, m) => sum + memberLiveSeconds(m, now), 0);

  // 박수 묶음
  const clapsByMember = recentClaps.reduce((acc, c) => {
    (acc[c.toUid] = acc[c.toUid] || []).push(c);
    return acc;
  }, {});

  const copyCode = () => {
    const code = roomMeta?.inviteCode;
    if (!code) return;
    try {
      navigator.clipboard.writeText(code);
      window.dispatchEvent(new CustomEvent("room-flash", { detail: { msg: L("room.codeCopied", { code }) } }));
    } catch (_) {
      // 클립보드 차단된 환경 — 적어도 코드를 보여주기
      window.dispatchEvent(new CustomEvent("room-flash", { detail: { msg: L("room.inviteCodeFlash", { code }) } }));
    }
  };
  const onLeave = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const msg = L("room.leaveConfirm");
    const ok = window.dialog
      ? await window.dialog.confirm(msg)
      : window.confirm(msg);
    if (ok) await room.leaveRoom();
  };
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column", minHeight: 0,
      padding: 8, boxSizing: "border-box",
      background: themeBg,
      backgroundSize: "200% 200%",
      backgroundPosition: "center",
    }}>
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 8px",
        border: "1.1px solid var(--ink)",
        borderRadius: "9px 9px 0 0",
        background: "linear-gradient(180deg, var(--paper) 0%, var(--blue-soft) 100%)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.45) inset",
      }}>
        <span style={{ fontSize: 13, color: "var(--ink-2)" }}>♡</span>
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: "var(--hand)", fontSize: 14, fontWeight: 700,
          color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{roomMeta?.name || L("room.title")}</span>
        <button onClick={copyCode} title={L("room.copyInviteCode")} style={roomChromeBtn}>↗</button>
        <button
          onClick={() => room.setMyStatus(room.state.myStatus === "away" ? "working" : "away")}
          title={room.state.myStatus === "away" ? L("room.awayOff") : L("room.away")}
          style={{
            ...roomChromeBtn,
            width: "auto",
            padding: "0 7px",
            background: room.state.myStatus === "away" ? "var(--cream-soft)" : roomChromeBtn.background,
            color: room.state.myStatus === "away" ? "var(--ink)" : roomChromeBtn.color,
          }}
        >{room.state.myStatus === "away" ? L("room.return") : L("room.away")}</button>
        <button
          onClick={onLeave}
          onPointerDown={(e) => e.stopPropagation()}
          title={L("room.leave")}
          style={{ ...roomChromeBtn, width: "auto", padding: "0 7px" }}
        >{L("room.leave")}</button>
      </div>

      {isLocal && <LocalModeBanner inline />}

      <div style={{
        flex: 1, minHeight: 0,
        display: "grid", gridTemplateColumns: "1fr 82px", gap: 8,
        padding: "8px 8px 6px",
        borderLeft: "1.1px solid var(--ink)",
        borderRight: "1.1px solid var(--ink)",
        background: "color-mix(in srgb, var(--paper) 78%, transparent)",
      }}>
        <RoomChatLog
          members={sorted}
          myUid={myUid}
          myTodos={myTodos}
          roomLog={roomLog}
          now={now}
          totalSeconds={totalSeconds}
          themeBg={themeBg}
          onToggleTodo={(id) => diary.actions.toggleTodo(id)}
        />
        <div style={{ display: "grid", gridTemplateRows: "repeat(4, 1fr)", gap: 6, minHeight: 0 }}>
          {[0, 1, 2, 3].map((i) => {
            const m = sorted[i];
            return m ? (
              <RoomProfileSlot
                key={m.uid}
                member={m}
                isMe={m.uid === myUid}
                now={now}
                claps={clapsByMember[m.uid] || []}
                displayStatus={memberRoomStatus(m, now, myUid, room.state.myStatus)}
                notice={noticeByUid.get(m.uid)}
                onClick={m.uid === myUid ? () => window.dispatchEvent(new CustomEvent("room-edit-profile")) : () => room.sendClap(m.uid)}
              />
            ) : <RoomEmptySlot key={i} />;
          })}
        </div>
      </div>

      <div style={{
        flexShrink: 0,
        padding: "7px 8px 8px",
        border: "1.1px solid var(--ink)",
        borderRadius: "0 0 9px 9px",
        background: "linear-gradient(180deg, var(--paper) 0%, var(--blue-soft) 100%)",
      }}>
        <RoomTodoRegisterPanel todos={myTodos} />
      </div>

      <ProfileEditModal />
      <FlashToast />
    </div>
  );
}

function RoomChatLog({ members, myUid, myTodos, roomLog, now, totalSeconds, themeBg, onToggleTodo }) {
  return (
    <div style={{
      minHeight: 0,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      border: "1.1px solid var(--ink)",
      borderRadius: 8,
      background: "color-mix(in srgb, var(--paper) 80%, transparent)",
      backgroundSize: "200% 200%",
      backgroundPosition: "center",
      boxShadow: "0 1px 0 rgba(255,255,255,0.45) inset",
    }}>
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
        padding: "10px 10px 8px",
        background: "color-mix(in srgb, var(--paper) 80%, transparent)",
      }}>
        {members.map((m) => {
          const isMe = m.uid === myUid;
          const todos = isMe
            ? myTodos.filter(t => t.roomVisible).map(t => ({ id: t.id, title: t.title, done: t.done }))
            : Array.isArray(m.visibleTodos)
              ? m.visibleTodos.map((item, i) => roomTodoView(item, `${m.uid}-${i}`))
                  .filter((t) => t.title)
              : [];
          const label = isMe ? L("room.you") : (m.displayName || L("room.friend"));
          const offline = isMemberOffline(m, now);
          const events = (roomLog || []).filter((ev) => ev.uid === m.uid);
          return (
            <div key={m.uid} style={{ marginBottom: 12, opacity: offline ? 0.55 : 1 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: "var(--hand)", fontSize: 12, fontWeight: 700,
                color: isMe ? "var(--point)" : "var(--ink-2)", marginBottom: 4,
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 5,
                  display: "grid", placeItems: "center",
                  border: "1px solid var(--ink)",
                  background: "var(--paper)",
                  flexShrink: 0,
                }}>
                  <RoomAvatarIcon value={m.avatar} size={14} />
                </span>
                <span>{label} says:</span>
              </div>
              {todos.length > 0 ? todos.map((t) => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 6,
                  padding: "2px 0 2px 10px",
                  fontFamily: "var(--hand)", fontSize: 12.5, lineHeight: 1.35,
                  color: "var(--ink)",
                }}>
                  <button
                    onClick={isMe ? () => onToggleTodo(t.id) : undefined}
                    title={isMe ? L("room.toggleDone") : ""}
                    style={{
                      all: "unset", cursor: isMe ? "pointer" : "default",
                      width: 10, height: 10, marginTop: 3, flexShrink: 0,
                      border: "1px solid var(--ink)", borderRadius: 2,
                      background: t.done ? "var(--mint)" : "var(--paper)",
                      display: "grid", placeItems: "center",
                      fontSize: 8, color: "#fff",
                    }}
                  >{t.done ? "✓" : ""}</button>
                  <span style={{
                    textDecoration: t.done ? "line-through" : "none",
                    wordBreak: "break-word",
                  }}>{t.title}</span>
                </div>
              )) : (
                <div className="sk-cap" style={{ paddingLeft: 10, fontSize: 11 }}>
                  {isMe ? L("room.noTodo") : L("room.noPublicTitle")}
                </div>
              )}
              {events.map((ev, i) => (
                <div key={ev.id || `${ev.uid}-${ev.at || 0}-${i}`} style={{
                  padding: "3px 0 2px 10px",
                  fontFamily: "var(--hand)", fontSize: 12.5, lineHeight: 1.35,
                  color: "var(--ink)",
                }}>
                <span style={{ color: isMe ? "var(--point)" : "var(--ink-2)", fontWeight: 700 }}>{ev.nickname || label} say :</span>{" "}
                  <span>{ev.text}</span>{" "}
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-3)" }}>{fmtRoomClock(ev.at)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        padding: "6px 10px",
        borderTop: "1px dashed var(--ink)",
        background: "color-mix(in srgb, var(--paper) 80%, transparent)",
        fontFamily: "var(--hand)", fontSize: 11.5, color: "var(--ink-2)",
      }}>
        <span>{L("room.totalWork")}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>{fmtHMS(totalSeconds || 0)}</span>
      </div>
    </div>
  );
}

function RoomProfileSlot({ member, isMe, now, claps, displayStatus, notice, onClick }) {
  const offline = displayStatus === "offline";
  const seconds = memberLiveSeconds(member, now);
  const working = displayStatus === "working";
  const away = displayStatus === "away";
  const latestClap = claps.length > 0 ? claps[claps.length - 1] : null;
  const clapShow = latestClap && (now - latestClap.ts < 3000);
  const total = member.todoTotal || 0;
  const done = member.todoDone || 0;
  const progress = total > 0 ? Math.min(1, done / total) : 0;
  const iconHops = displayStatus === "online" || displayStatus === "working";
  return (
    <button onClick={onClick} title={isMe ? L("room.changeProfile") : L("room.clapHint")} style={{
      all: "unset", cursor: "pointer",
      position: "relative",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 3, minHeight: 0,
      border: "1.1px solid var(--ink)", borderRadius: 8,
      background: away ? "linear-gradient(180deg, var(--cream-soft), var(--paper))" : (isMe ? "linear-gradient(180deg, var(--pink-soft), var(--paper))" : "linear-gradient(180deg, var(--blue-soft), var(--paper))"),
      boxShadow: "0 1px 0 rgba(255,255,255,0.45) inset",
      opacity: offline ? 0.62 : 1,
      filter: offline ? "grayscale(0.7)" : "none",
    }}>
      {clapShow && <ClapBurst />}
      {notice && <RoomNoticeBubble text={notice.text} />}
      <span style={{
        width: 40, height: 40, borderRadius: 8,
        border: "1px solid var(--ink)",
        background: "var(--paper)", display: "grid", placeItems: "center",
      }}>
        <span style={{
          display: "grid", placeItems: "center",
          animation: iconHops ? "room-avatar-hop 1.1s steps(1, end) infinite" : "none",
        }}>
          <RoomAvatarIcon value={member.avatar} size={28} />
        </span>
      </span>
      <span style={{
        maxWidth: "90%",
        fontFamily: "var(--hand)", fontSize: 11.5, fontWeight: 700,
        color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{member.displayName || L("room.noName")}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: working ? "#35c45a" : (away ? "#f59e0b" : (offline ? "#9aa8bb" : "#f0c14d")),
        }} />
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink-2)" }}>
          {offline ? L("room.offlineStatus") : (away ? L("room.away") : (working ? L("room.workingStatus") : L("room.onlineStatus")))}
        </span>
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink-2)" }}>{fmtHMS(seconds)}</span>
      <span title={`경험치 ${done}/${total}`} style={{
        width: 48, height: 5, borderRadius: 99,
        border: "1px solid var(--ink)",
        background: "var(--paper)", overflow: "hidden",
      }}>
        <span style={{
          display: "block", width: `${progress * 100}%`, height: "100%",
          background: "linear-gradient(90deg, var(--point), var(--hi))",
          transition: "width 0.35s",
        }} />
      </span>
    </button>
  );
}

function RoomNoticeBubble({ text }) {
  return (
    <div style={{
      position: "absolute",
      right: 56,
      top: 8,
      zIndex: 20,
      width: 142,
      boxSizing: "border-box",
      padding: "6px 8px",
      border: "2px solid var(--ink)",
      borderRadius: 2,
      background: "var(--paper)",
      color: "var(--ink)",
      fontFamily: "var(--hand)",
      fontSize: 11.5,
      lineHeight: 1.25,
      textAlign: "left",
      boxShadow: "3px 3px 0 color-mix(in srgb, var(--ink-soft) 60%, transparent)",
      pointerEvents: "none",
      imageRendering: "pixelated",
    }}>
      <span style={{
        position: "absolute",
        right: -8,
        top: 22,
        width: 12,
        height: 12,
        background: "var(--paper)",
        borderRight: "2px solid var(--ink)",
        borderBottom: "2px solid var(--ink)",
        transform: "rotate(-45deg)",
      }} />
      <span style={{
        position: "absolute",
        left: -9,
        top: -14,
        fontSize: 20,
        lineHeight: 1,
        color: "var(--hi)",
        textShadow: "1px 0 var(--ink), -1px 0 var(--ink), 0 1px var(--ink), 0 -1px var(--ink)",
      }}>✦</span>
      <span style={{ position: "relative", zIndex: 1 }}>{text}</span>
    </div>
  );
}

function RoomEmptySlot() {
  return <div style={{ minHeight: 0 }} />;
}

function RoomTodoRegisterPanel({ todos }) {
  const [, force] = useStateRoom(0);
  const selectedRef = useRefRoom(new Set());
  const sig = todos.map(t => `${t.id}:${t.roomVisible ? 1 : 0}`).join("|");
  useEffectRoom(() => {
    selectedRef.current = new Set(todos.filter(t => t.roomVisible).map(t => t.id));
    force(x => x + 1);
  }, [sig]);

  const selected = selectedRef.current;
  const toggle = (id) => {
    const next = new Set(selectedRef.current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedRef.current = next;
    force(x => x + 1);
  };
  const register = () => {
    todos.forEach((t) => {
      const shouldShow = selectedRef.current.has(t.id);
      if (!!t.roomVisible !== shouldShow) diary.actions.toggleTodoVisible(t.id);
    });
    window.dispatchEvent(new CustomEvent("room-flash", { detail: { msg: L("room.registered") } }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontFamily: "var(--hand)", fontSize: 11.5, color: "var(--ink-2)",
      }}>
        <span style={{ fontWeight: 700, color: "var(--ink)" }}>{L("room.shareToday")}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{selected.size}/{todos.length}</span>
      </div>
      <div style={{
        maxHeight: 82,
        overflowY: "auto", overflowX: "hidden",
        display: "flex", flexDirection: "column", gap: 4,
        paddingRight: 2,
      }}>
        {todos.length ? todos.map(t => {
          const on = selected.has(t.id);
          return (
            <button key={t.id} onClick={() => toggle(t.id)} style={{
              all: "unset", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              padding: "3px 7px",
              border: "1px solid var(--ink)",
              borderRadius: 6,
              background: on ? "color-mix(in srgb, var(--paper) 80%, var(--blue-soft))" : "color-mix(in srgb, var(--paper) 80%, transparent)",
              fontFamily: "var(--hand)", fontSize: 12, color: t.done ? "var(--ink-3)" : "var(--ink)",
            }}>
              <span style={{
                width: 11, height: 11, borderRadius: 2,
                border: "1px solid var(--ink)",
                background: on ? "var(--mint)" : "var(--paper)",
                display: "grid", placeItems: "center",
                fontSize: 8, color: "#fff", flexShrink: 0,
              }}>{on ? "✓" : ""}</span>
              <span style={{
                flex: 1, minWidth: 0,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                textDecoration: t.done ? "line-through" : "none",
              }}>{t.title}</span>
            </button>
          );
        }) : (
          <div className="sk-cap" style={{ padding: "4px 2px", fontSize: 11 }}>{L("room.noTodayTasks")}</div>
        )}
      </div>
      <button onClick={register} style={{
        all: "unset", cursor: "pointer",
        display: "grid", placeItems: "center",
        minHeight: 24,
        border: "1.1px solid var(--ink)", borderRadius: 6,
        background: "color-mix(in srgb, var(--paper) 78%, var(--blue-soft))",
        fontFamily: "var(--hand)", fontSize: 12, fontWeight: 700, color: "var(--ink)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.45) inset",
      }}>{L("room.register")}</button>
    </div>
  );
}

// ===========================================================
// MemberCard — 왼쪽 todo 리스트 / 오른쪽 프로필 / 하단 진행도 바
//   ┌─ header ─────────────────────────┐
//   │ todo list (left)   │ avatar+name │
//   │                    │ 03:14 🟢   │
//   │ ▓▓▓▓░░░░░░  4/8                  │
//   └──────────────────────────────────┘
// ===========================================================
function MemberCard({ member, isMe, now, onClap, claps, selfTodos, onEditProfile }) {
  // 상태 결정 — 우선순위: offline (자동) > paused (수동) > away (수동) > working
  const offlineByTimeout = isMemberOffline(member, now);
  const manualStatus = member.status; // 'working' | 'away' | 'paused' | (옛 'idle' / undefined)
  let displayStatus;
  if (offlineByTimeout) displayStatus = "offline";
  else if (manualStatus === "paused") displayStatus = "paused";
  else if (manualStatus === "away") displayStatus = "away";
  else if (member.workStartedAt) displayStatus = "working";
  else displayStatus = "idle";  // working 으로 표시되지만 시간 안 흐름 (트래커가 아직 활성 안 봄)

  const isWorking = displayStatus === "working";
  const isOffline = displayStatus === "offline";
  const isPaused = displayStatus === "paused";
  const isAway = displayStatus === "away";
  // 카드를 흐리게 처리할지 — paused/offline 둘 다 회색이지만 paused 는 살짝 더 선명
  const dim = isOffline || isPaused;
  const seconds = memberLiveSeconds(member, now);

  // 완료 이벤트 디텍션
  const prevDoneRef = useRefRoom(member.todoDone);
  const [sparkle, setSparkle] = useStateRoom(false);
  useEffectRoom(() => {
    if (member.todoDone > prevDoneRef.current) {
      setSparkle(true);
      const id = setTimeout(() => setSparkle(false), 2400);
      prevDoneRef.current = member.todoDone;
      return () => clearTimeout(id);
    }
    prevDoneRef.current = member.todoDone;
  }, [member.todoDone]);

  const latestClap = claps.length > 0 ? claps[claps.length - 1] : null;
  const clapShow = latestClap && (now - latestClap.ts < 3000);

  const total = member.todoTotal || 0;
  const done = member.todoDone || 0;
  const progress = total > 0 ? Math.min(1, done / total) : 0;
  const statusDotColor =
    isWorking ? "#60c47a"   // 초록
    : isAway  ? "#f0c14d"   // 노랑
    : "#cbd5e0";            // 회색 (paused / offline / idle)
  const statusLabel =
    isPaused  ? L("room.pausedStatus")
    : isOffline ? L("room.offlineStatus")
    : isAway   ? L("room.away")
    : "";  // working / idle 은 라벨 없음

  // todo 리스트 결정
  // - 본인(isMe): diary 의 모든 오늘 할일 + 각 항목에 roomVisible 표시
  // - 남: member.visibleTodos 의 제목들만 (비공개 제목은 서버에 없음)
  let visibleTodos = null;
  if (isMe && selfTodos) {
    visibleTodos = selfTodos.map((t) => ({
      id: t.id, title: t.title, done: t.done, roomVisible: !!t.roomVisible,
    }));
  } else if (!isMe && Array.isArray(member.visibleTodos) && member.visibleTodos.length > 0) {
    visibleTodos = member.visibleTodos
      .map((item, i) => roomTodoView(item, "v" + i))
      .filter((t) => t.title);
  }

  const tone = isMe ? "var(--pink-soft)" : "var(--blue-soft)";
  const headerTone = isMe ? "var(--pink)" : "var(--blue)";

  return (
    <div style={{
      position: "relative",
      background: dim ? "var(--paper-2)" : "var(--paper)",
      border: "1.1px solid " + (dim ? "var(--ink-soft)" : "var(--ink)"),
      borderRadius: 12,
      overflow: "hidden",
      opacity: isOffline ? 0.65 : (isPaused ? 0.85 : 1),
      filter: isOffline ? "grayscale(0.7)" : (isPaused ? "grayscale(0.4)" : "none"),
      boxShadow: dim ? "none" : "0 2px 0 var(--paper-3)",
      outline: sparkle ? "1.8px solid var(--hi)" : "none",
      outlineOffset: 1,
      display: "flex", flexDirection: "column",
      minHeight: 0,
    }}>
      {sparkle && <Sparkle />}
      {clapShow && <ClapBurst />}

      {/* 카드 헤더 — 미니 타이틀바 */}
      <div style={{
        flexShrink: 0,
        height: 18,
        background: dim ? "var(--paper-3)" : `linear-gradient(180deg, ${headerTone} 0%, ${tone} 100%)`,
        borderBottom: "1px solid " + (dim ? "var(--ink-soft)" : "var(--ink)"),
        padding: "0 8px",
        display: "flex", alignItems: "center", gap: 5,
        fontSize: 9, color: "var(--ink)",
        letterSpacing: "0.04em",
      }}>
        <span style={{ flex: 1 }} />
        {isMe && <StatusToggle currentStatus={member.status} />}
        {!isMe && !isOffline && !isPaused && (
          <button onClick={onClap} title={L("room.clapHint")} style={miniHeaderBtn}>👏</button>
        )}
      </div>

      {/* 본체 — 좌(todo) / 우(프로필) 좌우 분할 */}
      <div style={{
        flex: 1, minHeight: 0,
        display: "flex", gap: 8,
        padding: "7px 9px 3px",
      }}>
        {/* 왼쪽: todo 리스트 (대화창 느낌) */}
        <div style={{
          flex: 1, minWidth: 0, minHeight: 0,
          overflowY: "auto", overflowX: "hidden",
          paddingRight: 2,
        }}>
          {visibleTodos && visibleTodos.length > 0 ? (
            visibleTodos.map((t, i) => {
              const isPrivate = isMe && !t.roomVisible;
              return (
                <div key={t.id || i} style={{
                  display: "flex", alignItems: "center", gap: 5, marginBottom: 2,
                  fontFamily: "var(--hand)", fontSize: 12, lineHeight: 1.25,
                  color: t.done ? "var(--ink-3)" : "var(--ink-2)",
                  textDecoration: t.done ? "line-through" : "none",
                  opacity: isPrivate ? 0.55 : 1,
                }}>
                  <span style={{
                    flexShrink: 0,
                    width: 9, height: 9, borderRadius: 2,
                    border: "1.1px solid " + (t.done ? "var(--ink-3)" : "var(--ink-2)"),
                    background: t.done ? "var(--mint)" : "transparent",
                    display: "grid", placeItems: "center",
                    fontSize: 8,
                  }}>{t.done ? "✓" : ""}</span>
                  <span style={{
                    flex: 1, minWidth: 0,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{t.title}</span>
                  {isMe && (
                    <button
                      onClick={() => diary.actions.toggleTodoVisible(t.id)}
                      title={t.roomVisible ? L("room.visibleTip") : L("room.privateTip")}
                      style={{
                        all: "unset", cursor: "pointer",
                        width: 16, height: 14, borderRadius: 4,
                        display: "grid", placeItems: "center",
                        fontSize: 9, flexShrink: 0,
                        background: t.roomVisible ? "var(--hi)" : "transparent",
                        border: t.roomVisible ? "1px solid var(--ink)" : "1px solid var(--ink-soft)",
                        filter: t.roomVisible ? "none" : "grayscale(1)",
                        opacity: t.roomVisible ? 1 : 0.45,
                      }}
                    >
                      👁
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="sk-cap" style={{ fontSize: 11, color: "var(--ink-3)", padding: "4px 2px", lineHeight: 1.3 }}>
              {isMe
                ? (total > 0 ? L("room.privateWithTasks") : L("room.noTodo"))
                : (total > 0 ? L("room.privateProgress", { n: total - done }) : L("room.noTodo"))}
            </div>
          )}
        </div>

        {/* 오른쪽: 프로필 (둥근사각 아바타 + 닉네임 + 작업시간) */}
        <div style={{
          flexShrink: 0, width: 78,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
        }}>
          <button
            onClick={isMe && onEditProfile ? onEditProfile : undefined}
            title={isMe ? L("room.changeNameAvatar") : member.displayName}
            style={{
              all: "unset",
              cursor: isMe ? "pointer" : "default",
              width: 48, height: 48, borderRadius: 10,
              border: "1.1px solid " + (dim ? "var(--ink-soft)" : "var(--ink)"),
              background: isWorking ? "var(--hi-soft)" : "var(--paper-2)",
              display: "grid", placeItems: "center",
              fontSize: 28, flexShrink: 0,
              boxShadow: "0 1.5px 0 var(--paper-3)",
            }}>
            <RoomAvatarIcon value={member.avatar} size={32} />
          </button>
          <div style={{
            fontFamily: "var(--hand)", fontSize: 12, fontWeight: 700,
            color: "var(--ink)", textAlign: "center",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: "100%",
          }}>
            {member.displayName || L("room.noName")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusDotColor }} />
            <span className="sk-mono" style={{ fontSize: 9, color: "var(--ink-2)" }}>
              {isWorking ? fmtHMS(seconds) : (seconds > 0 ? fmtHMS(seconds) : "--:--")}
            </span>
            {statusLabel && (
              <div style={{
                fontFamily: "var(--hand)", fontSize: 9, color: "var(--ink-3)",
                marginTop: 1, letterSpacing: "0.02em",
              }}>{statusLabel}</div>
            )}
          </div>
        </div>
      </div>

      {/* 하단: 진행도 바 (채팅 입력칸 자리) */}
      <div style={{
        flexShrink: 0,
        padding: "5px 9px 7px",
        borderTop: "1px dashed var(--ink-soft)",
        display: "flex", alignItems: "center", gap: 7,
      }}>
        <div style={{
          flex: 1, height: 8, borderRadius: 99,
          background: "var(--paper-3)", overflow: "hidden",
          border: "1px solid var(--ink-soft)",
          position: "relative",
        }}>
          <div style={{
            width: `${progress * 100}%`, height: "100%",
            background: progress >= 1
              ? "linear-gradient(90deg, var(--mint), var(--green))"
              : (isWorking ? "linear-gradient(90deg, var(--pink), var(--hi))" : "var(--ink-soft)"),
            transition: "width 0.4s",
          }} />
        </div>
        <span style={{
          fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "var(--ink-2)",
          minWidth: 32, textAlign: "right",
        }}>
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

// 내 카드 헤더의 작은 상태 토글 (working / away / paused). 클릭 시 메뉴.
// offline 은 자동만 (앱 종료/heartbeat 타임아웃) — 메뉴에 없음.
function StatusToggle({ currentStatus }) {
  const room = window.roomStore.useRoom();
  const [open, setOpen] = useStateRoom(false);
  // 메뉴 바깥 클릭 시 닫기
  useEffectRoom(() => {
    if (!open) return;
    const h = () => setOpen(false);
    setTimeout(() => window.addEventListener("click", h, { once: true }), 0);
    return () => window.removeEventListener("click", h);
  }, [open]);
  const my = room.state.myStatus || "working";
  const cur = currentStatus === "paused" ? "paused"
            : currentStatus === "away" ? "away"
            : my;  // 서버 상태 우선이되, paused/away 가 아니면 로컬 my 사용
  const dot = cur === "working" ? "#60c47a" : cur === "away" ? "#f0c14d" : "#cbd5e0";
  const choose = (next) => (e) => {
    e.stopPropagation();
    room.setMyStatus(next);
    setOpen(false);
  };
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={L("room.changeMyStatus")}
        style={{
          ...miniHeaderBtn,
          background: "transparent",
          border: "1px solid var(--ink)",
          padding: 0,
          width: 16, height: 14,
          display: "grid", placeItems: "center",
        }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: dot,
        }} />
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "absolute", top: 18, right: 0, zIndex: 30,
          background: "var(--paper)",
          border: "1.1px solid var(--ink)",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(40,51,63,0.18)",
          padding: 4, minWidth: 110,
        }}>
          {[
            { v: "working", color: "#60c47a", label: L("room.workingStatus") },
            { v: "away",    color: "#f0c14d", label: L("room.away") },
            { v: "paused",  color: "#cbd5e0", label: L("room.pausedStatus") },
          ].map((opt) => (
            <button key={opt.v} onClick={choose(opt.v)} style={{
              all: "unset", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              width: "100%", boxSizing: "border-box",
              padding: "4px 8px", borderRadius: 5,
              fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)",
              background: cur === opt.v ? "var(--hi-soft)" : "transparent",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: opt.color }} />
              <span>{opt.label}</span>
              {cur === opt.v && <span style={{ marginLeft: "auto", fontSize: 9 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// EmptySlot — 빈 자리. 코드는 상단에 이미 있으므로 여기선 "+ 초대" 버튼만.
function EmptySlot({ index, onCopy }) {
  return (
    <button
      onClick={onCopy}
      title={L("room.copyInviteSame")}
      style={{
        all: "unset", cursor: "pointer",
        position: "relative",
        background: "transparent",
        border: "1.1px dashed var(--ink-soft)",
        borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        minHeight: 0,
        color: "var(--ink-3)",
        fontFamily: "var(--hand)", fontSize: 12,
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 6,
        border: "1.1px dashed var(--ink-soft)",
        background: "var(--paper)",
        display: "grid", placeItems: "center",
        fontSize: 14,
      }}>＋</span>
      초대
    </button>
  );
}

// ---- 작은 연출 ----
function Sparkle() {
  return (
    <div style={{
      position: "absolute", top: -6, right: 10,
      fontSize: 18, animation: "room-sparkle-pop 2.2s ease-out both",
      pointerEvents: "none",
    }}>✨</div>
  );
}
function ClapBurst() {
  return (
    <div style={{
      position: "absolute", top: -4, right: 14,
      fontSize: 22, animation: "room-clap-pop 2.6s ease-out both",
      pointerEvents: "none",
    }}>👏</div>
  );
}

// ---- 로컬 모드 배너 ----
function LocalModeBanner({ inline = false }) {
  return (
    <div style={{
      padding: "6px 10px",
      background: inline ? "var(--cream-soft)" : "var(--cream-soft)",
      borderTop: inline ? "1.1px dashed var(--ink-soft)" : "none",
      borderBottom: inline ? "1.1px dashed var(--ink-soft)" : "1.1px solid var(--ink-soft)",
      borderRadius: inline ? 0 : 8,
      fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink-2)",
      textAlign: "center",
    }}>
      🔒 {L("room.localMode")}
    </div>
  );
}

// ---- 프로필 편집 모달 ----
function ProfileEditModal() {
  const room = window.roomStore.useRoom();
  const [open, setOpen] = useStateRoom(false);
  const [name, setName] = useStateRoom(room.state.profile.displayName || "");

  useEffectRoom(() => {
    const h = () => { setName(room.state.profile.displayName || ""); setOpen(true); };
    window.addEventListener("room-edit-profile", h);
    return () => window.removeEventListener("room-edit-profile", h);
  }, [room.state.profile.displayName]);

  if (!open) return null;
  const close = () => setOpen(false);
  const save = () => { room.setProfile({ displayName: name.trim() }); close(); };

  return (
    <div onClick={close} style={{
      position: "fixed", inset: 0, background: "rgba(40,51,63,0.25)",
      backdropFilter: "blur(2px)", display: "grid", placeItems: "center",
      zIndex: 1000, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="sk-box" style={{
        background: "var(--paper)", padding: 16, width: "min(320px, 92vw)",
        boxShadow: "0 8px 0 var(--paper-3), 0 12px 30px rgba(40,51,63,0.18)",
      }}>
        <div className="sk-label" style={{ marginBottom: 10 }}>{L("room.pickAvatar")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {room.avatars.map((a) => (
            <button key={a} onClick={() => room.setProfile({ avatar: a })}
              style={{
                ...avatarBtn, width: 30, height: 30,
                background: room.state.profile.avatar === a ? "var(--hi)" : "var(--paper)",
              }}><RoomAvatarIcon value={a} size={20} /></button>
          ))}
        </div>
        <div className="sk-label" style={{ marginBottom: 6 }}>{L("room.namePrompt")}</div>
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          autoFocus
          style={{ ...formInput, width: "100%" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 12 }}>
          <button onClick={close} style={smallBtn}>{L("common.cancel")}</button>
          <button onClick={save} style={smallBtnPrimary}>{L("common.save")}</button>
        </div>
      </div>
    </div>
  );
}

// ---- 작은 토스트 ("코드 복사됨") ----
function FlashToast() {
  const [msg, setMsg] = useStateRoom("");
  useEffectRoom(() => {
    const h = (e) => {
      setMsg(e.detail?.msg || "");
      setTimeout(() => setMsg(""), 1400);
    };
    window.addEventListener("room-flash", h);
    return () => window.removeEventListener("room-flash", h);
  }, []);
  if (!msg) return null;
  return (
    <div style={{
      position: "absolute", left: "50%", bottom: 60, transform: "translateX(-50%)",
      padding: "6px 14px", borderRadius: 99,
      background: "var(--ink)", color: "var(--paper)",
      fontFamily: "var(--hand)", fontSize: 12,
      boxShadow: "0 4px 12px rgba(40,51,63,0.25)",
      pointerEvents: "none",
      animation: "room-toast-pop 1.4s ease-out both",
    }}>
      ✓ {msg}
    </div>
  );
}

// ===========================================================
// Self → Server 동기화 — diary 상태 변화 감지해 사건 단위로 patch
// ===========================================================
function useRoomSync() {
  const room = window.roomStore.useRoom();
  const { state: ds } = diary.useDiary();
  const roomId = room.state.currentRoomId;

  // 현재 프로젝트의 오늘 진행도
  const todos = (ds.todos || []).filter((t) => t.projectId === ds.currentProjectId);
  const today = diary.today();
  const todayTodos = todos.filter((t) => {
    if (!t.dueDate) return true;
    if (t.dueDate === today) return true;
    if (t.dueDate < today && !t.done) return true;
    return false;
  });
  const todoTotal = todayTodos.length;
  const todoDone = todayTodos.filter((t) => t.done).length;
  // 공개로 표시한 할일 제목들 — 효과 deps 에 sig 형태로 들어가서 변경 감지
  const visibleTitlesSig = todayTodos
    .filter((t) => t.roomVisible)
    .map((t) => (t.done ? "1" : "0") + ":" + (t.order ?? 0) + ":" + (t.pinned ? "p" : "") + ":" + t.title)
    .join("|");

  // 작업 중 여부 — 외부모드 ON 이거나, 트래커가 "활성"으로 보는 상황 ≈ workSessions가 방금 갱신됨
  // 단순화: 외부모드 ON 이면 무조건 작업중. 그 외엔 lastTs 기준 최근 3분 이내면 작업중.
  // 단, 사용자 수동 상태가 away/paused 면 트래커 무시하고 시간 흐름 멈춤.
  const myStatus = room.state.myStatus || "working";
  const ext = !!(window.workTracker && window.workTracker.isExternal());
  const todaySession = (ds.workSessions || []).find((w) => w.date === today);
  const lastTs = todaySession?.lastTs || 0;
  const recentlyActive = (Date.now() - lastTs) < 3 * 60 * 1000;
  const workingNow = (myStatus === "working") && (ext || recentlyActive);

  // me (서버 상태) 가 source of truth — ref-less 설계로 앱 재시작 시에도 일관됨.
  const myUid = window.firebaseBridge ? window.firebaseBridge.uid() : null;
  const me = room.state.members.find((m) => m.uid === myUid);
  const prevDoneRef = useRefRoom(null);

  useEffectRoom(() => {
    if (!roomId || !myUid || !window.firebaseBridge) return;

    const patch = {};
    const meWorkStartedAt = me?.workStartedAt || null;
    const meAcc = me?.accumulatedSecondsToday || 0;
    const meLastActiveAt = me?.lastActiveAt || null;
    const meStatus = me?.status || null;
    const meTodoTotal = me?.todoTotal ?? -1;
    const meTodoDone = me?.todoDone ?? -1;
    const meVisibleSig = Array.isArray(me?.visibleTodos)
      ? me.visibleTodos.map((item) => `${visibleTodoDone(item) ? 1 : 0}:${visibleTodoTitle(item)}`).join("|")
      : "";
    let logEntry = null;
    const doneMap = new Map(todayTodos.map((t) => [t.id, { done: !!t.done, title: t.title, visible: !!t.roomVisible }]));
    if (myStatus === "away") {
      prevDoneRef.current = doneMap;
      return;
    }
    if (!prevDoneRef.current) {
      prevDoneRef.current = doneMap;
    } else {
      doneMap.forEach((cur, id) => {
        if (logEntry) return;
        const prev = prevDoneRef.current.get(id);
        if (prev && !prev.done && cur.done) {
          logEntry = {
            nickname: room.state.profile.displayName || me?.displayName || L("room.you"),
            text: cur.visible && cur.title?.trim()
              ? L("room.donePublic", { title: cur.title.trim() })
              : L("room.donePrivate"),
            todoPublic: !!cur.visible,
          };
        }
      });
      prevDoneRef.current = doneMap;
    }

    // 진행도 — me 기준 비교 (서버에 이미 같은 값이면 skip)
    if (todoTotal !== meTodoTotal) patch.todoTotal = todoTotal;
    if (todoDone !== meTodoDone) patch.todoDone = todoDone;

    // ★ 공개 표시한 할일의 "제목"만. 비공개 제목은 여기서 누락 → 서버에 절대 안 올라감.
    const visibleTodosToSend = todayTodos
      .filter((t) => t.roomVisible)
      .slice()
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (a.order ?? 0) - (b.order ?? 0);
      })
      .map((t) => ({ title: t.title, done: !!t.done }));
    const visibleSig = visibleTodosToSend.map((t) => `${t.done ? 1 : 0}:${t.title}`).join("|");
    if (visibleSig !== meVisibleSig) {
      patch.visibleTodos = visibleTodosToSend;
    }

    // ===== 세션 (workStartedAt / accumulatedSecondsToday) =====
    // me 기준이라 앱 재시작 시에도 일관 — 죽기 전 session 이 me 에 살아 있으면
    // 그걸 lastActiveAt 까지 commit 하고 새 세션을 시작.
    const sessionShouldEnd = !workingNow && meWorkStartedAt;
    const sessionShouldStart = workingNow && !meWorkStartedAt;

    if (sessionShouldEnd) {
      // 종료 — cutoff = lastActiveAt (있고 workStartedAt 보다 늦으면) 또는 now
      const cutoff = (meLastActiveAt && meLastActiveAt > meWorkStartedAt)
        ? Math.min(meLastActiveAt, Date.now())
        : Date.now();
      const ranSec = Math.max(0, Math.floor((cutoff - meWorkStartedAt) / 1000));
      patch.workStartedAt = null;
      patch.accumulatedSecondsToday = meAcc + ranSec;
      patch.accumulatedDate = today;
    } else if (sessionShouldStart) {
      patch.workStartedAt = true;
    }

    // 자리비움은 로컬 전용 모드라 서버 상태/heartbeat 를 쓰지 않는다.
    if (myStatus !== meStatus) {
      patch.status = myStatus;
    }

    if (Object.keys(patch).length > 0 || logEntry) {
      room.patchMyMember(patch, logEntry);
    }
  }, [roomId, myUid, todoTotal, todoDone, workingNow, visibleTitlesSig, myStatus,
      me?.workStartedAt, me?.accumulatedSecondsToday, me?.status,
      me?.todoTotal, me?.todoDone]);

  // (showTodoTitle 변화 감지는 위 메인 effect 의 deps 에 me?.showTodoTitle 가 들어 있어
  // currentTodoTitle/recentTodos 가 같은 patch 로 묶여 함께 나감 — 별도 effect 필요 없음)

  // Heartbeat — 8분 마다. paused/away 는 비용 0 모드라 멈춤.
  useEffectRoom(() => {
    if (!roomId || !myUid) return;
    if (myStatus === "paused" || myStatus === "away") return;
    const id = setInterval(() => {
      room.patchMyMember({}); // 빈 patch 라도 updateMyMember 가 lastActiveAt 만 갱신함
    }, 8 * 60 * 1000);
    return () => clearInterval(id);
  }, [roomId, myUid, myStatus]);

  // accumulated 날짜 자정 넘어가면 리셋 — 다음 사건성 patch 때 0 으로 세팅
  useEffectRoom(() => {
    if (!me || me.accumulatedDate === today) return;
    if (me.accumulatedDate && me.accumulatedDate !== today) {
      room.patchMyMember({ accumulatedSecondsToday: 0, accumulatedDate: today });
    }
  }, [today, me?.accumulatedDate]);
}

// ===========================================================
// 스타일
// ===========================================================
const codeChip = {
  all: "unset", cursor: "pointer",
  padding: "3px 12px", borderRadius: 99,
  border: "1.1px solid var(--ink)",
  background: "var(--paper)",
  fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink)",
  display: "inline-flex", alignItems: "center", gap: 4,
};
const shareBtn = {
  all: "unset", cursor: "pointer",
  padding: "3px 11px", borderRadius: 99,
  border: "1.1px solid var(--ink)",
  background: "var(--paper)",
  fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)",
  display: "inline-flex", alignItems: "center", gap: 5,
};
const smallBtn = {
  all: "unset", cursor: "pointer",
  padding: "4px 12px", borderRadius: 99,
  border: "1.1px solid var(--ink)",
  background: "var(--paper)",
  fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)",
};
const smallBtnPrimary = {
  ...smallBtn,
  background: "linear-gradient(180deg, var(--point-soft), var(--point))",
  fontWeight: 700,
};
const roomChromeBtn = {
  all: "unset", cursor: "pointer",
  width: 22, height: 20, borderRadius: 5,
  display: "grid", placeItems: "center",
  border: "1px solid var(--ink)",
  background: "color-mix(in srgb, var(--paper) 78%, var(--blue-soft))",
  fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink)",
};
const bigBtn = {
  all: "unset", cursor: "pointer",
  display: "block", width: "100%", boxSizing: "border-box", textAlign: "center",
  padding: "12px", borderRadius: 12,
  border: "1.1px solid var(--ink)",
  background: "var(--paper)",
  fontFamily: "var(--hand)", fontSize: 14, fontWeight: 700, color: "var(--ink)",
  boxShadow: "0 2px 0 var(--paper-3)",
};
const bigPrimaryBtn = {
  ...bigBtn,
  background: "linear-gradient(180deg, var(--point-soft), var(--point))",
};
const inlineForm = {
  display: "flex", flexDirection: "column", gap: 8,
  padding: 12, borderRadius: 12,
  background: "var(--paper-2)",
  border: "1.1px dashed var(--ink-2)",
};
const formInput = {
  border: "1.1px solid var(--ink-soft)", outline: "none",
  background: "var(--paper)", borderRadius: 8,
  fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink)",
  padding: "6px 10px",
};
const avatarBtn = {
  all: "unset", cursor: "pointer",
  width: 36, height: 36, borderRadius: "50%",
  border: "1.1px solid var(--ink)",
  background: "var(--paper-2)",
  display: "grid", placeItems: "center",
  fontSize: 22, flexShrink: 0,
};
const clapBtn = {
  all: "unset", cursor: "pointer",
  padding: "4px 9px", borderRadius: 99,
  border: "1.1px solid var(--ink)",
  background: "var(--paper)",
  fontSize: 14, color: "var(--ink)",
  flexShrink: 0,
};
const miniHeaderBtn = {
  all: "unset", cursor: "pointer",
  width: 18, height: 14, borderRadius: 4,
  background: "var(--paper)",
  border: "1px solid var(--ink)",
  display: "grid", placeItems: "center",
  fontSize: 9, color: "var(--ink)",
  flexShrink: 0,
};

// ---- 애니메이션 CSS 주입 (한 번만) ----
if (!document.getElementById("room-anim-css")) {
  const s = document.createElement("style");
  s.id = "room-anim-css";
  s.textContent = `
    @keyframes room-sparkle-pop {
      0%   { transform: translateY(4px) scale(0.6); opacity: 0; }
      30%  { transform: translateY(-4px) scale(1.1); opacity: 1; }
      80%  { transform: translateY(-8px) scale(1.0); opacity: 1; }
      100% { transform: translateY(-14px) scale(0.9); opacity: 0; }
    }
    @keyframes room-clap-pop {
      0%   { transform: translateY(8px) scale(0.5) rotate(-12deg); opacity: 0; }
      20%  { transform: translateY(-2px) scale(1.2) rotate(0deg); opacity: 1; }
      60%  { transform: translateY(-8px) scale(1.0) rotate(8deg); opacity: 1; }
      100% { transform: translateY(-22px) scale(0.85) rotate(-4deg); opacity: 0; }
    }
    @keyframes room-toast-pop {
      0%   { opacity: 0; transform: translateX(-50%) translateY(8px); }
      15%  { opacity: 1; transform: translateX(-50%) translateY(0); }
      85%  { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(4px); }
    }
    @keyframes room-avatar-hop {
      0%, 36%, 100% { transform: translateY(0); }
      37%, 62%      { transform: translateY(-3px); }
      63%, 72%      { transform: translateY(-1px); }
    }
  `;
  document.head.appendChild(s);
}

// ===========================================================
// RoomSyncBridge — 보이지 않는 컴포넌트. App 에서 항상 마운트.
// 본인 → 서버 sync 만 담당하므로, 어느 탭에 있든 todo 토글이 방에 반영됨.
// 부팅도 같이 함 (구독은 RoomView 가 탭 진입 시 붙임).
// ===========================================================
function RoomSyncBridge() {
  const room = window.roomStore.useRoom();
  useEffectRoom(() => { room.bootstrap(); }, []);
  useRoomSync();
  return null;
}

window.RoomView = RoomView;
window.RoomSyncBridge = RoomSyncBridge;
