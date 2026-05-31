/* global React, diary */
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
function RoomView() {
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
    return <EmptyRoomView />;
  }
  return <RoomMainView />;
}

// ===========================================================
// 빈 상태 — 방 만들기 / 초대 코드 입장
// ===========================================================
function EmptyRoomView() {
  const room = window.roomStore.useRoom();
  const { state: ds } = diary.useDiary();
  const now = useNowTick();
  const [mode, setMode] = useStateRoom(null);  // null | 'create' | 'join'
  const [name, setName] = useStateRoom("");
  const [code, setCode] = useStateRoom("");
  const [err, setErr] = useStateRoom("");
  const [busy, setBusy] = useStateRoom(false);
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

  // 합성 멤버 (실제 방에 들어가지 않은 상태에서 카드만 미리 그리기)
  const synthMember = {
    uid: "_preview",
    displayName: room.state.profile.displayName || "나",
    avatar: room.state.profile.avatar || "🐰",
    status: "idle",
    workStartedAt: null,
    accumulatedSecondsToday: 0,
    todoTotal: myTodos.length,
    todoDone: myTodos.filter((t) => t.done).length,
    visibleTodos: [],
    lastActiveAt: Date.now(),  // 미리보기는 항상 "온라인"
  };

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode === "create") {
        await room.createRoom({ name: name.trim() || L("room.title") });
      } else if (mode === "join") {
        await room.joinByCode(code.trim());
      }
    } catch (e) {
      const m = e && e.message;
      if (m === "ROOM_FULL") setErr(L("room.full"));
      else if (m === "ROOM_NOT_FOUND") setErr(L("room.notFound"));
      else if (m === "INVALID_CODE") setErr(L("room.codeInvalid"));
      else setErr(m || "오류");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      padding: "18px 16px", gap: 14, overflowY: "auto",
    }}>
      {isLocal && <LocalModeBanner />}

      <div style={{ textAlign: "center", marginTop: 12 }}>
        <div style={{ fontSize: 42, marginBottom: 6 }}>👥</div>
        <div style={{ fontFamily: "var(--hand)", fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
          {L("room.emptyTitle")}
        </div>
        <div className="sk-cap" style={{
          marginTop: 8, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-line",
        }}>
          {L("room.emptyHint")}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {mode !== "join" && (
          <button onClick={() => setMode("create")} style={mode === "create" ? bigPrimaryBtn : bigBtn}>
            <span style={{ marginRight: 6 }}>＋</span>{L("room.create")}
          </button>
        )}
        {mode === "create" && (
          <div style={inlineForm}>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder={L("room.namePh")} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              style={formInput}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { setMode(null); setErr(""); }} style={smallBtn}>취소</button>
              <button onClick={submit} disabled={busy} style={{ ...smallBtnPrimary, opacity: busy ? 0.5 : 1 }}>
                {busy ? "…" : L("room.create")}
              </button>
            </div>
          </div>
        )}

        {mode !== "create" && (
          <button onClick={() => setMode("join")} style={mode === "join" ? bigPrimaryBtn : bigBtn}>
            <span style={{ marginRight: 6 }}>✉</span>{L("room.join")}
          </button>
        )}
        {mode === "join" && (
          <div style={inlineForm}>
            <input
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={L("room.codePh")} autoFocus
              maxLength={6}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              style={{ ...formInput, fontFamily: "var(--mono)", letterSpacing: "0.15em", textAlign: "center", fontSize: 17 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { setMode(null); setErr(""); }} style={smallBtn}>취소</button>
              <button onClick={submit} disabled={busy || code.length < 4} style={{ ...smallBtnPrimary, opacity: (busy || code.length < 4) ? 0.5 : 1 }}>
                {busy ? "…" : L("room.join")}
              </button>
            </div>
          </div>
        )}

        {err && <div className="sk-cap" style={{ color: "var(--bad)", textAlign: "center", marginTop: 4 }}>{err}</div>}
      </div>

      {/* 내 카드 미리보기 — 프로필 편집 + 공개 토글 시뮬레이션 */}
      <SelfPreview synthMember={synthMember} myTodos={myTodos} now={now} />
    </div>
  );
}

// 빈 상태에서 보여주는 "내 카드 미리보기" — 실제 방 안 들어가도 어떻게 보일지 +
// 공개로 표시할 할일 큐레이션 가능 (할일별 👁 토글이 그대로 동작).
function SelfPreview({ synthMember, myTodos, now }) {
  const room = window.roomStore.useRoom();
  const [avatarOpen, setAvatarOpen] = useStateRoom(false);
  const [name, setName] = useStateRoom(room.state.profile.displayName || "");

  return (
    <div style={{
      marginTop: 14, paddingTop: 14,
      borderTop: "1.1px dashed var(--ink-soft)",
    }}>
      <div className="sk-label" style={{ marginBottom: 8, textAlign: "center" }}>
        ♡ 내 카드 미리보기
      </div>

      {/* 프로필 편집 (이름 + 아바타) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setAvatarOpen((o) => !o)} title={L("room.pickAvatar")} style={avatarBtn}>
          {room.state.profile.avatar || "🐰"}
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => room.setProfile({ displayName: name.trim() })}
          placeholder={L("room.namePrompt")}
          style={{ ...formInput, flex: 1 }}
        />
      </div>
      {avatarOpen && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10,
          padding: 8, background: "var(--paper-2)",
          border: "1.1px solid var(--ink-soft)", borderRadius: 10,
        }}>
          {room.avatars.map((a) => (
            <button key={a} onClick={() => { room.setProfile({ avatar: a }); setAvatarOpen(false); }}
              style={{
                ...avatarBtn, width: 32, height: 32, fontSize: 20,
                background: room.state.profile.avatar === a ? "var(--hi)" : "var(--paper)",
              }}>{a}</button>
          ))}
        </div>
      )}

      {/* 실제 MemberCard 와 동일한 모양으로 미리보기 — 고정 높이 박스 안에서 */}
      <div style={{ height: 150, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MemberCard
            member={synthMember}
            isMe={true}
            now={now}
            onClap={() => {}}
            claps={[]}
            selfTodos={myTodos}
            onEditProfile={() => setAvatarOpen(true)}
          />
        </div>
      </div>
      <div className="sk-cap" style={{
        fontSize: 11, color: "var(--ink-3)", textAlign: "center", marginTop: 8, lineHeight: 1.4,
      }}>
        할 일 옆 <span style={{
          display: "inline-block", padding: "0 4px", borderRadius: 3,
          background: "var(--hi)", border: "1px solid var(--ink)", margin: "0 2px",
        }}>👁</span> 눌러서<br/>방 멤버에게 보여주고 싶은 것만 켜두세요
      </div>
    </div>
  );
}

// ===========================================================
// 메인 뷰 — 방 안에 있을 때 (4분할 그리드)
// ===========================================================
function RoomMainView() {
  const room = window.roomStore.useRoom();
  const { state: ds } = diary.useDiary();
  const now = useNowTick();
  const { roomMeta, members, recentClaps } = room.state;
  const myUid = window.firebaseBridge.uid();
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
      window.dispatchEvent(new CustomEvent("room-flash", { detail: { msg: `${code} 복사됨` } }));
    } catch (_) {
      // 클립보드 차단된 환경 — 적어도 코드를 보여주기
      window.dispatchEvent(new CustomEvent("room-flash", { detail: { msg: `초대 코드: ${code}` } }));
    }
  };
  const onLeave = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const msg = L("room.leaveConfirm");
    const ok = window.confirm(msg);
    if (ok) await room.leaveRoom();
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* 상단 헤더 */}
      <div style={{
        padding: "9px 14px 8px", flexShrink: 0,
        borderBottom: "1.1px solid var(--ink-soft)",
        background: "linear-gradient(180deg, var(--pink-soft) 0%, var(--paper) 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>♡</span>
          <span style={{
            fontFamily: "var(--hand)", fontSize: 15, fontWeight: 700, color: "var(--ink)",
            flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{roomMeta?.name || L("room.title")}</span>
          <span className="sk-mono" style={{
            padding: "1px 8px", borderRadius: 99,
            background: "var(--paper)", border: "1.1px solid var(--ink-soft)", fontSize: 10,
          }}>{L("room.connected", { n: onlineCount })}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <button onClick={copyCode} title="초대 코드 복사" style={shareBtn}>
            <span>{L("room.invite")}</span>
            <span style={{ fontSize: 11, lineHeight: 1 }}>↗</span>
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={onLeave} style={smallBtn}>{L("room.leave")}</button>
        </div>
      </div>

      {isLocal && <LocalModeBanner inline />}

      {/* 멤버 카드 — 실제 인원만 가운데 정렬 (1명이면 1개, 2명이면 2개, ...) */}
      <div style={{
        flex: 1, minHeight: 0,
        display: "flex", flexDirection: "column", justifyContent: "center",
        gap: 8, padding: "12px 10px",
        overflowY: "auto", overflowX: "hidden",
      }}>
        {sorted.map((m) => (
          <div key={m.uid} style={{
            flexShrink: 0,
            minHeight: 140, maxHeight: 200,
            display: "flex", flexDirection: "column",
          }}>
            <MemberCard
              member={m}
              isMe={m.uid === myUid}
              now={now}
              onClap={() => room.sendClap(m.uid)}
              claps={clapsByMember[m.uid] || []}
              selfTodos={m.uid === myUid ? myTodos : null}
              onEditProfile={m.uid === myUid ? () => window.dispatchEvent(new CustomEvent("room-edit-profile")) : null}
            />
          </div>
        ))}
      </div>

      {/* 하단 합계 바 */}
      <div style={{
        flexShrink: 0, padding: "7px 14px",
        borderTop: "1.1px solid var(--ink-soft)",
        background: "linear-gradient(180deg, var(--paper) 0%, var(--pink-soft) 100%)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 13 }}>⏱</span>
        <span className="sk-label" style={{ fontSize: 11, flex: 1 }}>{L("room.todayTotal")}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
          {fmtHM(totalSeconds)}
        </span>
      </div>

      <ProfileEditModal />
      <FlashToast />
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
    isPaused  ? "공유 쉬는 중"
    : isOffline ? "오프라인"
    : isAway   ? "자리비움"
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
    visibleTodos = member.visibleTodos.map((title, i) => ({ id: "v" + i, title, done: false }));
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
                      title={t.roomVisible ? "방 멤버에게 보임 — 클릭해서 숨기기" : "비공개 — 클릭해서 방에 공개"}
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
                ? (total > 0 ? "할 일은 있지만 공개로 표시한 게 없어요" : L("room.noTodo"))
                : (total > 0 ? `${total - done}개 진행 중 · 제목 비공개` : L("room.noTodo"))}
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
            title={isMe ? "이름·아바타 변경" : member.displayName}
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
            {member.avatar || "🐰"}
          </button>
          <div style={{
            fontFamily: "var(--hand)", fontSize: 12, fontWeight: 700,
            color: "var(--ink)", textAlign: "center",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: "100%",
          }}>
            {member.displayName || "이름없음"}
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
        title="내 상태 바꾸기"
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
            { v: "working", color: "#60c47a", label: "작업 중" },
            { v: "away",    color: "#f0c14d", label: "자리비움" },
            { v: "paused",  color: "#cbd5e0", label: "공유 쉬기" },
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
      title="초대 코드 복사 (상단 코드와 동일)"
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
                ...avatarBtn, width: 30, height: 30, fontSize: 19,
                background: room.state.profile.avatar === a ? "var(--hi)" : "var(--paper)",
              }}>{a}</button>
          ))}
        </div>
        <div className="sk-label" style={{ marginBottom: 6 }}>{L("room.namePrompt")}</div>
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          autoFocus
          style={{ ...formInput, width: "100%" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 12 }}>
          <button onClick={close} style={smallBtn}>취소</button>
          <button onClick={save} style={smallBtnPrimary}>저장</button>
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

  useEffectRoom(() => {
    if (!roomId || !myUid || !window.firebaseBridge) return;

    const patch = {};
    const meWorkStartedAt = me?.workStartedAt || null;
    const meAcc = me?.accumulatedSecondsToday || 0;
    const meLastActiveAt = me?.lastActiveAt || null;
    const meStatus = me?.status || null;
    const meTodoTotal = me?.todoTotal ?? -1;
    const meTodoDone = me?.todoDone ?? -1;
    const meVisibleSig = Array.isArray(me?.visibleTodos) ? me.visibleTodos.join("|") : "";

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
      .map((t) => t.title);
    const visibleSig = visibleTodosToSend.join("|");
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
      patch.workStartedAt = Date.now();
    }

    // 상태 (manual myStatus → server)
    if (myStatus !== meStatus) {
      patch.status = myStatus;
    }

    if (Object.keys(patch).length > 0) {
      room.patchMyMember(patch);
    }
  }, [roomId, myUid, todoTotal, todoDone, workingNow, visibleTitlesSig, myStatus,
      me?.workStartedAt, me?.accumulatedSecondsToday, me?.status,
      me?.todoTotal, me?.todoDone]);

  // (showTodoTitle 변화 감지는 위 메인 effect 의 deps 에 me?.showTodoTitle 가 들어 있어
  // currentTodoTitle/recentTodos 가 같은 patch 로 묶여 함께 나감 — 별도 effect 필요 없음)

  // Heartbeat — 2분 마다. 단, paused 면 멈춤 ("커튼 치기" — 비용 0).
  // away 는 heartbeat 계속 (방에 붙어있음 표시).
  useEffectRoom(() => {
    if (!roomId || !myUid) return;
    if (myStatus === "paused") return;  // ★ paused 동안 heartbeat 안 함
    const id = setInterval(() => {
      room.patchMyMember({}); // 빈 patch 라도 updateMyMember 가 lastActiveAt 만 갱신함
    }, 2 * 60 * 1000);
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
