/* global React, diary, InlineAdd, DelBtn, useI18n, L */
// ===========================================================
// 타이머 — 카운트다운 + 시스템 알림
// - lengthMin 단위로 순환 (다 되면 알림 + 자동 새 사이클)
// - 일시정지 / 재개 / "방금 스트레칭함" 으로 리셋
// - 알림 권한 요청 플로우 (사용자가 명시적으로 ON 했을 때만)
// - 페이지가 열려있는 동안 동작 (설치형/PWA로 래핑 시 백그라운드 가능)
// ===========================================================

const { useState, useEffect, useRef } = React;

const fmtMS = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
};

const STRETCH_TIPS = [
  "어깨 한 번 돌리고 와요",
  "목을 천천히 좌우로",
  "허리 펴고 깊게 숨 한 번",
  "손목 한 바퀴 돌리기",
  "눈 깜빡깜빡, 멀리 한 번 보기",
  "잠깐 일어서서 기지개",
  "물 한 모금 어떠세요?",
];
function randTip() { return STRETCH_TIPS[Math.floor(Math.random() * STRETCH_TIPS.length)]; }

function Timer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {/* 음악 한 줄 */}
      <PlaylistBar />
      {/* 작업 시간 / 디데이 — 한 줄 (외곽 박스 없음) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <WorkTime />
        <span style={{ color: "var(--ink-3)", fontSize: 16 }}>/</span>
        <DDay />
      </div>
    </div>
  );
}

// ---- 작업 시간 — 00 H 00 M ----
// 앱 실행 = 기본 ON (초록 점, "WORKING"). 점 클릭하면 STOP (검은 점, "STOPPED").
// 호버하면 우측에 작은 ⟳ 버튼 — 클릭 시 오늘 작업 시간을 0으로 초기화.
function WorkTime() {
  const { state, actions } = diary.useDiary();
  const min = diary.select.workMinutesToday(state);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const [hover, setHover] = useState(false);
  const [running, setRunning] = useState(() => !!(window.workTracker && window.workTracker.isRunning()));
  useEffect(() => {
    if (!window.workTracker) return;
    return window.workTracker.subscribe(setRunning);
  }, []);
  const toggleRunning = () => { if (window.workTracker) window.workTracker.toggle(); };
  const resetWork = async () => {
    const msg = L("worktrack.resetConfirm");
    const ok = await (window.dialog
      ? window.dialog.confirm(msg)
      : Promise.resolve(window.confirm(msg)));
    if (ok) actions.resetWorkMinutes();
  };

  const dotColor = running ? "#ff3b3b" : "#1f1f1f";
  const label = running ? L("worktrack.runningOn") : L("worktrack.runningOff");

  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, color: "var(--ink)" }}
    >
      <button onClick={toggleRunning} title={label} style={{
        all: "unset", cursor: "pointer", flexShrink: 0,
        width: 7, height: 7, borderRadius: "50%",
        background: dotColor,
        boxShadow: running ? "0 0 4px rgba(255,59,59,0.55)" : "none",
        animation: running ? "wt-blink 1.1s ease-in-out infinite" : "none",
        transition: "background .15s",
      }} />
      <span style={{ fontSize: 9.5, letterSpacing: 1, color: running ? "#b03030" : "var(--ink-2)" }}>
        {running ? "WORKING" : "STOPPED"}
      </span>
      <span>{pad(h)}</span>
      <span style={{ fontSize: 10, opacity: .6 }}>H</span>
      <span>{pad(m)}</span>
      <span style={{ fontSize: 10, opacity: .6 }}>M</span>
      <button
        onClick={resetWork}
        title={L("worktrack.resetTip")}
        aria-label={L("worktrack.resetTip")}
        style={{
          all: "unset", cursor: "pointer", flexShrink: 0,
          marginLeft: 2,
          width: 16, height: 16, borderRadius: "50%",
          display: "grid", placeItems: "center",
          fontSize: 11, fontWeight: 700, lineHeight: 1,
          color: "var(--ink-2)",
          opacity: hover ? 0.85 : 0,
          pointerEvents: hover ? "auto" : "none",
          transition: "opacity 0.15s",
        }}
      >⟳</button>
    </span>
  );
}

// ---- 디데이 ----
function ddayDiff(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  if (isNaN(target)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}
function ddayText(diff) {
  if (diff == null) return L("dday.set");
  if (diff === 0) return L("dday.dday");
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

function DDay() {
  const { state, actions } = diary.useDiary();
  const dday = state.dday ?? { date: "", label: "" };
  const ddayLabel = dday.label === "디데이" ? L("dday.label") : dday.label;
  const [open, setOpen] = useState(false);
  const diff = ddayDiff(dday.date);
  const dayNum = dday.date ? new Date(dday.date + "T00:00:00").getDate() : null;

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => setOpen(o => !o)} title={ddayLabel || L("dday.title")} style={{
        all: "unset", cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}>
        {/* 달력 아이콘 */}
        <div style={{
          width: 22, height: 24, borderRadius: 4, overflow: "hidden", flexShrink: 0,
          border: "1.1px solid var(--ink)", background: "#fff", position: "relative",
        }}>
          <div style={{ position: "absolute", top: -2, left: 5, width: 2, height: 4, background: "var(--ink)", borderRadius: 1 }} />
          <div style={{ position: "absolute", top: -2, right: 5, width: 2, height: 4, background: "var(--ink)", borderRadius: 1 }} />
          <div style={{ height: 6, background: "#ff8da1", borderBottom: "1px solid var(--ink)" }} />
          <div style={{ display: "grid", placeItems: "center", height: 17, fontFamily: "var(--mono)", fontWeight: 700, fontSize: 11, color: "var(--ink)" }}>
            {dayNum ?? "·"}
          </div>
        </div>
        <span style={{
          fontFamily: "var(--mono)", fontWeight: 700,
          fontSize: diff == null ? 13 : 17, color: "var(--ink)",
        }}>{ddayText(diff)}</span>
      </button>

      {/* 디데이 이름 — 우측에서 직접 입력 */}
      <Editable
        value={dday.label}
        onChange={(v) => actions.setDday({ label: v })}
        placeholder={L("dday.label")}
        style={{
          fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink-2)",
          maxWidth: 76, whiteSpace: "nowrap", overflow: "hidden",
        }}
      />

      {open && (
        <div className="sk-box" style={{
          position: "absolute", top: "100%", right: 0,
          marginTop: 6, padding: 10, width: 180,
          background: "var(--paper)", boxShadow: "0 4px 0 var(--paper-3)", zIndex: 28,
        }}>
          <div className="sk-label" style={{ marginBottom: 6 }}>{L("dday.title")}</div>
          <input
            type="text"
            value={dday.label}
            onChange={(e) => actions.setDday({ label: e.target.value })}
            placeholder={L("dday.namePlaceholder")}
            style={{
              width: "100%", boxSizing: "border-box", marginBottom: 6,
              border: "1.1px solid var(--ink)", borderRadius: 6, padding: "4px 6px",
              fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)", outline: "none",
            }}
          />
          <input
            type="date"
            value={dday.date}
            onChange={(e) => actions.setDday({ date: e.target.value })}
            style={{
              width: "100%", boxSizing: "border-box",
              border: "1.1px solid var(--ink)", borderRadius: 6, padding: "4px 6px",
              fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", outline: "none",
            }}
          />
          {dday.date && (
            <button onClick={() => actions.setDday({ date: "" })} style={{
              all: "unset", cursor: "pointer", marginTop: 6,
              fontFamily: "var(--hand)", fontSize: 12, color: "var(--bad)",
            }}>{L("dday.clear")}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- 플레이리스트 바 (타이머와 통합) ----
// 전역 음악 컨트롤러 구독 훅
function useMusic() {
  const [, force] = useState(0);
  useEffect(() => window.musicPlayer.subscribe(() => force(x => x + 1)), []);
  return window.musicPlayer;
}

// 유튜브 URL(또는 11자 ID)에서 videoId 추출
function extractYouTubeId(url) {
  if (!url) return null;
  const s = url.trim();
  const patterns = [
    /youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  if (/^[\w-]{11}$/.test(s)) return s;
  return null;
}

function PlaylistBar() {
  const { state, actions } = diary.useDiary();
  const tracks = state.playlist ?? [];
  const music = useMusic();
  const [open, setOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [err, setErr] = useState("");
  const playerSlotRef = useRef(null);

  // 플레이리스트 변경 시 전역 큐 동기화 (저장 곡 자동 재생)
  useEffect(() => { window.musicPlayer.setQueue(tracks); }, [tracks]);

  const add = async (raw) => {
    const videoId = extractYouTubeId(raw);
    if (!videoId) { setErr(L("music.err")); return; }
    setErr("");
    let title = "";
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${videoId}`);
      if (r.ok) title = (await r.json()).title || "";
    } catch (_) { /* 오프라인이면 기본 제목 */ }
    actions.addTrack({ url: raw.trim(), videoId, title });
  };

  const ms = music.getState();
  const label = ms.hasQueue ? (ms.title || L("music.loading")) : L("music.add");

  const syncNativePlayer = () => {
    if (!ms.nativeMode || !music.setNativeViewport) return;
    const visible = open && playerOpen;
    const el = playerSlotRef.current;
    if (!visible || !el) {
      music.setNativeViewport({ x: 0, y: 0, width: 1, height: 1, visible: false });
      return;
    }
    const r = el.getBoundingClientRect();
    music.setNativeViewport({
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.max(1, Math.round(r.width)),
      height: Math.max(1, Math.round(r.height)),
      visible: true,
    });
  };

  useEffect(() => {
    if (!ms.nativeMode || !music.setNativeViewport) return;
    let raf = requestAnimationFrame(syncNativePlayer);
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncNativePlayer);
    };
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [ms.nativeMode, ms.videoId, ms.playing, open, playerOpen]);

  const runMusic = (fn) => {
    if (ms.nativeMode && tracks.length && !playerOpen) {
      setOpen(true);
      setPlayerOpen(true);
      setTimeout(fn, 80);
    } else {
      fn();
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => runMusic(() => music.prev())} title="이전" style={pbBtn}>⏮</button>
        <button onClick={() => runMusic(() => music.toggle())} title={ms.playing ? "일시정지" : "재생"} style={pbBtn}>
          {ms.playing ? "⏸" : "▶"}
        </button>
        <button onClick={() => runMusic(() => music.next())} title="다음" style={pbBtn}>⏭</button>
        <div className="marquee" style={{
          flex: 1, height: 20, lineHeight: "20px",
          borderRadius: 6, padding: "0 4px",
          background: "rgba(40,51,63,0.92)",
          color: "#9be15d", fontFamily: "var(--mono)", fontSize: 12,
        }}>
          <span className="marquee-inner">{label}　♫　{label}</span>
        </div>
        <button onClick={() => setOpen(o => !o)} title="플레이리스트" style={pbBtn}>{open ? "▾" : "+"}</button>
      </div>
      {/* 펼침: 곡 추가 + 목록 (위로 팝오버) */}
      {open && (
        <div className="sk-box" style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 6, padding: 10, background: "var(--paper)",
          boxShadow: "0 4px 0 var(--paper-3)", zIndex: 28,
        }}>
          <div className="sk-label" style={{ marginBottom: 6 }}>{L("music.playlist")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span className="sk-cap" style={{ flexShrink: 0, minWidth: 28 }} title={L("music.volume")}>
              {ms.volume <= 0 ? "🔇" : ms.volume < 50 ? "🔉" : "🔊"}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={ms.volume ?? 100}
              onChange={(e) => music.setVolume(Number(e.target.value))}
              aria-label={L("music.volume")}
              style={{ flex: 1, minWidth: 0, accentColor: "var(--hi)" }}
            />
            <span className="sk-cap" style={{ width: 28, textAlign: "right", flexShrink: 0 }}>
              {ms.volume ?? 100}
            </span>
          </div>
          <InlineAdd placeholder={L("music.paste")} onAdd={add} />
          {ms.nativeMode && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setPlayerOpen(v => !v)}
                title="YouTube"
                style={{
                  all: "unset", cursor: "pointer", width: "100%",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  boxSizing: "border-box", padding: "4px 6px",
                  border: "1.1px solid var(--ink)", borderRadius: 6,
                  background: "var(--paper-2)", color: "var(--ink)",
                  fontFamily: "var(--mono)", fontSize: 11,
                }}
              >
                <span>YouTube</span>
                <span>{playerOpen ? "▾" : "▸"}</span>
              </button>
              {playerOpen && (
                <div
                  ref={playerSlotRef}
                  style={{
                    marginTop: 6,
                    width: "100%",
                    height: 200,
                    overflow: "hidden",
                    border: "1.1px solid var(--ink)",
                    borderRadius: 6,
                    background: "#111",
                  }}
                />
              )}
            </div>
          )}
          {err && <div className="sk-cap" style={{ color: "var(--bad)", marginTop: 4 }}>{err}</div>}
          {tracks.length > 0 ? (
            <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto", overflowX: "hidden" }}>
              {tracks.map(t => {
                const isCur = t.videoId === ms.videoId;
                return (
                  <div key={t.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "3px 5px", borderRadius: 6,
                    background: isCur ? "var(--hi-soft)" : "transparent",
                  }}>
                    <button onClick={() => runMusic(() => music.play(t.videoId))} title="재생" style={{
                      all: "unset", cursor: "pointer", width: 16, textAlign: "center",
                      color: "var(--ink)", fontSize: 12,
                    }}>{isCur && ms.playing ? "♪" : "▶"}</button>
                    <span style={{
                      flex: 1, fontFamily: "var(--hand)", fontSize: 13,
                      color: "var(--ink)", fontWeight: isCur ? 700 : 400,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{t.title}</span>
                    <DelBtn onClick={() => actions.removeTrack(t.id)} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="sk-cap" style={{ marginTop: 4 }}>{L("music.empty")}</div>
          )}
        </div>
      )}
    </div>
  );
}

const pbBtn = {
  all: "unset", cursor: "pointer",
  width: 22, height: 20, flexShrink: 0,
  display: "grid", placeItems: "center",
  borderRadius: 6, border: "1.1px solid var(--ink)",
  background: "var(--paper)", color: "var(--ink)", fontSize: 11,
};

// ---- 도넛 ----
function TimerDonut({ remaining, progress, paused, enabled, running, onClick }) {
  const size = 34;
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * progress;
  const color = !enabled ? "var(--ink-soft)"
              : paused   ? "var(--ink-3)"
              : "var(--hi)";

  return (
    <button onClick={onClick} title={running ? "클릭: 일시정지" : "클릭: 시작/재개"} style={{
      all: "unset", cursor: "pointer",
      position: "relative", width: size, height: size,
      flexShrink: 0,
    }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r}
          fill="var(--paper)" stroke="var(--paper-3)" strokeWidth="3.5" />
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s linear" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "grid", placeItems: "center",
        fontFamily: "var(--mono)", fontSize: 10,
        color: "var(--ink)",
        pointerEvents: "none",
      }}>
        {!enabled ? "off" :
          paused ? "‖" :
          !running ? "▶" :
          fmtMS(remaining)}
      </div>
    </button>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span className="sk-cap" style={{ fontSize: 13, flex: 1 }}>{label}</span>
      {children}
    </div>
  );
}
function ToggleButton({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      all: "unset", cursor: "pointer",
      padding: "2px 10px", borderRadius: 99,
      border: "1.1px solid var(--ink)",
      background: on ? "var(--mint)" : "var(--paper)",
      fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)",
    }}>{children}</button>
  );
}
const NOTIFY_ICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='28' fill='%23ffc7d4' stroke='%238a6a5e' stroke-width='2'/><text x='32' y='42' text-anchor='middle' font-size='32' fill='%238a6a5e'>♡</text></svg>";

function tauriNotifyApi() {
  return window.__TAURI__ && window.__TAURI__.notification;
}

function showInAppNotify(title, body) {
  window.dispatchEvent(new CustomEvent("app-notify", { detail: { title, body } }));
}

function fireWebNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      icon: NOTIFY_ICON,
      tag: "todoary-pomo",
      silent: false,
    });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 10000);
  } catch (e) {
    console.warn("notification failed", e);
  }
}

async function sendNativeNotification(title, body) {
  const api = tauriNotifyApi();
  if (!api || !api.sendNotification) return false;
  try {
    let ok = await api.isPermissionGranted();
    if (!ok && api.requestPermission) {
      const p = await api.requestPermission();
      ok = p === "granted";
    }
    if (!ok) return false;
    await api.sendNotification({ title, body });
    return true;
  } catch (e) {
    console.warn("tauri notification failed", e);
    return false;
  }
}

async function requestNotifyPermission(actions) {
  const api = tauriNotifyApi();
  if (api && api.isPermissionGranted) {
    try {
      let ok = await api.isPermissionGranted();
      if (!ok && api.requestPermission) {
        const p = await api.requestPermission();
        ok = p === "granted";
      }
      actions.setNotificationsGranted(!!ok);
      return !!ok;
    } catch (e) {
      console.warn("tauri notify permission failed", e);
    }
  }
  if (!("Notification" in window)) {
    actions.setNotificationsGranted(false);
    return false;
  }
  if (Notification.permission === "granted") {
    actions.setNotificationsGranted(true);
    return true;
  }
  if (Notification.permission === "default") {
    const p = await Notification.requestPermission();
    const ok = p === "granted";
    actions.setNotificationsGranted(ok);
    return ok;
  }
  actions.setNotificationsGranted(false);
  return false;
}

async function notifyUser(title, body) {
  showInAppNotify(title, body);
  const nativeOk = await sendNativeNotification(title, body);
  if (!nativeOk) fireWebNotification(title, body);
}

function getPomoRemaining(timer) {
  const lenMs = diary.pomoCycleMs(timer);
  if (!timer?.cycleStartedAt) return lenMs;
  if (timer.paused) return timer.pausedRemainingMs ?? 0;
  return Math.max(0, lenMs - (Date.now() - timer.cycleStartedAt));
}

async function ensurePomoNotify(actions) {
  await requestNotifyPermission(actions);
}

function PomoCircleBtn({ onClick, title, bg = "var(--paper)", color = "var(--ink)", size = 34, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        all: "unset", cursor: "pointer", flexShrink: 0,
        width: size, height: size, borderRadius: "50%",
        display: "grid", placeItems: "center",
        border: "1.1px solid var(--ink)",
        background: bg,
        boxShadow: "0 1.5px 0 var(--paper-3)",
        fontFamily: "var(--hand)", fontSize: size >= 40 ? 15 : 13,
        fontWeight: 700, color, lineHeight: 1,
      }}
    >{children}</button>
  );
}

function PomoTimerFace({ remaining, progress, phase, running, workMin, paused }) {
  const size = 80;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * progress;
  const ring = phase === "break" ? "var(--mint)" : phase === "work" ? "var(--pink)" : "var(--blue)";
  const track = phase === "break" ? "var(--mint-soft)" : phase === "work" ? "var(--pink-soft)" : "var(--paper-3)";
  const phaseLabel = phase === "work" ? L("pomo.work") : phase === "break" ? L("pomo.break") : L("pomo.idle");
  const timeStr = running || phase !== "idle"
    ? fmtMS(remaining)
    : `${String(workMin ?? 25).padStart(2, "0")}:00`;

  return (
    <div style={{
      borderRadius: 14,
      border: "1.1px solid var(--ink-soft)",
      background: "linear-gradient(180deg, var(--paper-2) 0%, var(--paper) 72%)",
      padding: "14px 10px 12px",
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="var(--paper)" stroke={track} strokeWidth="5" />
          {(running || phase !== "idle") && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring} strokeWidth="5"
              strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.6s linear" }} />
          )}
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 17, fontWeight: 700,
            color: "var(--ink)", letterSpacing: "-0.02em",
            opacity: paused ? 0.55 : 1,
          }}>{timeStr}</div>
          <div style={{
            fontFamily: "var(--hand)", fontSize: 11, fontWeight: 700,
            color: "var(--ink-2)", marginTop: 2,
          }}>{phaseLabel}</div>
        </div>
      </div>
    </div>
  );
}

function PomoAlertBox({ msg }) {
  return (
    <div className="pomo-alert-box" style={{
      borderRadius: 12,
      border: "1.1px solid var(--ink)",
      background: "linear-gradient(180deg, var(--pink-soft) 0%, var(--paper) 88%)",
      padding: "14px 12px",
      textAlign: "center",
      minHeight: 80,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 0 var(--paper-3)",
    }}>
      <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 8 }}>🔔</div>
      <div style={{
        fontFamily: "var(--hand)", fontSize: 13, fontWeight: 700,
        color: "var(--ink)", lineHeight: 1.4,
      }}>{msg}</div>
    </div>
  );
}

const POMO_WIN_W = 196;
const POMO_WIN_H = 240;
const POMO_POS_LS = "todoary.pomoPopPos";

function loadPomoPos() {
  try {
    const raw = localStorage.getItem(POMO_POS_LS);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Number.isFinite(p.top) && Number.isFinite(p.left)) return { top: p.top, left: p.left };
  } catch (_) {}
  return null;
}

function savePomoPos(pos) {
  try { localStorage.setItem(POMO_POS_LS, JSON.stringify(pos)); } catch (_) {}
}

function anchorPomoPos(btnEl) {
  if (!btnEl) return { top: 80, left: 8 };
  const r = btnEl.getBoundingClientRect();
  return { top: r.bottom + 6, left: Math.max(8, r.right - POMO_WIN_W) };
}

function clampPomoPos(pos) {
  const maxTop = Math.max(8, window.innerHeight - POMO_WIN_H);
  const maxLeft = Math.max(8, window.innerWidth - POMO_WIN_W - 8);
  return {
    top: Math.max(8, Math.min(maxTop, pos.top)),
    left: Math.max(8, Math.min(maxLeft, pos.left)),
  };
}

// ---- 할 일 탭 뽀모도로 (설정에서 켜면 오늘/전체 탭 옆에 표시) ----
function PomodoroBarButton({ inline = false } = {}) {
  const { state, actions } = diary.useDiary();
  useI18n();
  const timer = state.timer ?? {};
  const phase = timer.phase ?? "idle";
  const [, tick] = useState(0);
  const [open, setOpen] = useState(false);
  const [popPos, setPopPos] = useState(() => loadPomoPos());
  const [alertKind, setAlertKind] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const userPlacedRef = useRef(!!loadPomoPos());
  const dragRef = useRef(null);

  const running = phase !== "idle" && !!timer.cycleStartedAt;
  const lenMs = running || phase !== "idle"
    ? diary.pomoCycleMs(timer)
    : diary.pomoIdleWorkMs(timer);
  const remaining = running || phase !== "idle"
    ? getPomoRemaining(timer)
    : lenMs;
  const progress = lenMs > 0 ? remaining / lenMs : 0;
  const alertMsg = alertKind === "work" ? L("pomo.notifyWork")
    : alertKind === "break" ? L("pomo.notifyBreak") : null;
  const displayPos = popPos || clampPomoPos(anchorPomoPos(btnRef.current));
  const popVisible = open || !!alertKind;
  const btnBg = phase === "break" ? "var(--mint-soft)" : phase === "work" ? "var(--pink-soft)" : "transparent";

  const ensurePopPos = () => {
    if (popPos) return popPos;
    const anchored = clampPomoPos(anchorPomoPos(btnRef.current));
    setPopPos(anchored);
    return anchored;
  };

  const dismissAlert = () => {
    if (!alertKind) return;
    setAlertKind(null);
    actions.advancePomodoroPhase();
  };

  const onTitleDragStart = (e) => {
    if (e.button !== 0 || e.target.closest(".xp-btn")) return;
    e.preventDefault();
    const pos = popPos || ensurePopPos();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTop: pos.top, startLeft: pos.left };
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const next = clampPomoPos({
        top: d.startTop + (ev.clientY - d.startY),
        left: d.startLeft + (ev.clientX - d.startX),
      });
      setPopPos(next);
      userPlacedRef.current = true;
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setPopPos(p => {
        if (p) savePomoPos(p);
        return p;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    (async () => {
      const api = window.__TAURI__ && window.__TAURI__.notification;
      if (api && api.isPermissionGranted) {
        try {
          const ok = await api.isPermissionGranted();
          if (ok && !timer.notificationsGranted) actions.setNotificationsGranted(true);
        } catch (_) {}
        return;
      }
      if ("Notification" in window && Notification.permission === "granted" && !timer.notificationsGranted) {
        actions.setNotificationsGranted(true);
      }
    })();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      tick(n => n + 1);
      const t = diary.getState().timer ?? {};
      if (t.phase === "idle" || !t.cycleStartedAt || t.paused) return;
      if (getPomoRemaining(t) > 0) return;
      if (t.lastNotifiedAt) return;
      actions.markNotified();
      setOpen(true);
      setPopPos(p => p || clampPomoPos(anchorPomoPos(btnRef.current)));
      setAlertKind(t.phase === "work" ? "work" : "break");
    }, 250);
    return () => clearInterval(id);
  }, [actions]);

  useEffect(() => {
    const onResize = () => setPopPos(p => (p ? clampPomoPos(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open || alertKind || userPlacedRef.current) return;
    const syncPos = () => {
      if (!btnRef.current || userPlacedRef.current) return;
      setPopPos(clampPomoPos(anchorPomoPos(btnRef.current)));
    };
    syncPos();
    window.addEventListener("scroll", syncPos, true);
    return () => window.removeEventListener("scroll", syncPos, true);
  }, [open, alertKind]);

  useEffect(() => {
    if (!open || alertKind) return;
    const onDoc = (e) => {
      const t = e.target;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, alertKind]);

  const toggleOpen = () => {
    setOpen(o => {
      const next = !o;
      if (next && !popPos) {
        const saved = loadPomoPos();
        if (saved) {
          setPopPos(clampPomoPos(saved));
          userPlacedRef.current = true;
        } else {
          setPopPos(clampPomoPos(anchorPomoPos(btnRef.current)));
        }
      }
      return next;
    });
  };

  const onPrimary = async () => {
    if (alertKind) {
      dismissAlert();
      return;
    }
    if (phase === "idle") {
      await ensurePomoNotify(actions);
      actions.startPomodoro();
      setOpen(true);
      if (!popPos) setPopPos(clampPomoPos(anchorPomoPos(btnRef.current)));
      return;
    }
    if (timer.paused) actions.resumeCycle();
    else actions.pauseCycle();
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggleOpen}
        title={L("pomo.title")}
        aria-label={L("pomo.title")}
        className={alertKind && !open ? "pomo-dock-bounce" : undefined}
        style={{
          all: "unset", cursor: "pointer", flexShrink: 0,
          marginLeft: inline ? "auto" : 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          gap: 4,
          minWidth: inline ? 28 : 20,
          height: inline ? undefined : 20,
          padding: inline ? "2px 9px" : (phase === "idle" ? 0 : "0 3px"),
          borderRadius: inline ? 99 : 5,
          border: running || open || alertKind
            ? "1.2px solid var(--ink)"
            : "1px solid var(--ink-soft)",
          background: btnBg,
          boxShadow: running || open || alertKind ? "0 1.5px 0 var(--paper-3)" : "none",
          fontFamily: phase === "idle" ? "var(--hand)" : "var(--mono)",
          fontSize: phase === "idle" ? (inline ? 12 : 11) : (inline ? 10 : 8),
          fontWeight: 700, color: running || open || alertKind ? "var(--ink)" : "var(--ink-3)",
          lineHeight: 1,
        }}
      >
        {phase === "idle" && !alertKind ? "🍅" : fmtMS(remaining)}
      </button>
      {popVisible && (
        <div
          ref={popRef}
          className={`xp-window xp-mini${alertKind ? " pomo-dock-bounce" : ""}`}
          style={{
            position: "fixed", top: displayPos.top, left: displayPos.left,
            width: POMO_WIN_W, zIndex: 1000,
          }}
        >
          <div
            onMouseDown={onTitleDragStart}
            style={{
              flexShrink: 0, padding: "4px 8px",
              background: alertKind
                ? "var(--pink-soft)"
                : phase === "work" ? "var(--pink-soft)"
                : phase === "break" ? "var(--mint-soft)"
                : "var(--lavender-soft)",
              borderBottom: "1.1px solid var(--ink)",
              display: "flex", alignItems: "center", gap: 6,
              cursor: "grab", userSelect: "none",
            }}
          >
            <span style={{ fontSize: 12, lineHeight: 1 }}>🍅</span>
            <span style={{
              fontFamily: "var(--hand)", fontSize: 12, fontWeight: 700,
              color: "var(--ink)", flex: 1, minWidth: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{alertKind ? "🔔 " : ""}{L("pomo.title")}</span>
            <button
              type="button"
              className="xp-btn close"
              onClick={() => { if (!alertKind) setOpen(false); else dismissAlert(); }}
              title="×"
            >×</button>
          </div>
          <div className="xp-body" style={{ padding: "10px 12px 12px" }}>
            {alertMsg ? (
              <PomoAlertBox msg={alertMsg} />
            ) : (
              <PomoTimerFace
                remaining={remaining}
                progress={progress}
                phase={phase}
                running={running}
                workMin={timer.workMin}
                paused={!!timer.paused}
              />
            )}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, marginTop: 10,
            }}>
              {alertKind ? (
                <PomoCircleBtn
                  size={42}
                  onClick={dismissAlert}
                  bg="var(--mint)"
                  title={L("pomo.continue")}
                >▶</PomoCircleBtn>
              ) : phase === "idle" ? (
                <PomoCircleBtn
                  size={42}
                  onClick={onPrimary}
                  bg="var(--mint)"
                  title={L("pomo.start")}
                >▶</PomoCircleBtn>
              ) : (
                <>
                  <PomoCircleBtn
                    onClick={onPrimary}
                    bg={timer.paused ? "var(--mint)" : "var(--paper)"}
                    title={timer.paused ? L("pomo.resume") : L("pomo.pause")}
                  >{timer.paused ? "▶" : "⏸"}</PomoCircleBtn>
                  {running && (
                    <PomoCircleBtn
                      onClick={() => actions.advancePomodoroPhase()}
                      bg="var(--blue-soft)"
                      title={L("pomo.skip")}
                    >⏭</PomoCircleBtn>
                  )}
                  <PomoCircleBtn
                    onClick={() => actions.stopPomodoro()}
                    bg="var(--pink-soft)"
                    title={L("pomo.stop")}
                  >■</PomoCircleBtn>
                </>
              )}
            </div>
            <div className="sk-mono" style={{
              textAlign: "center", marginTop: 8, fontSize: 10, color: "var(--ink-3)",
            }}>
              {timer.workMin ?? 25}m / {timer.breakMin ?? 5}m
              {(timer.pomodoroCount ?? 0) > 0 && ` · ${timer.pomodoroCount}`}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

window.Timer = Timer;
window.PomodoroBarButton = PomodoroBarButton;

// 워크 트래커 점 깜빡임 — 한 번만 주입
if (!document.getElementById("wt-blink-css")) {
  const s = document.createElement("style");
  s.id = "wt-blink-css";
  s.textContent = `
    @keyframes wt-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.25; }
    }
  `;
  document.head.appendChild(s);
}

if (!document.getElementById("pomo-alert-css")) {
  const s = document.createElement("style");
  s.id = "pomo-alert-css";
  s.textContent = `
    @keyframes pomo-dock-bounce {
      0%, 48%, 100% { transform: translateY(0); }
      9% { transform: translateY(-20px); }
      18% { transform: translateY(0); }
      27% { transform: translateY(-11px); }
      36% { transform: translateY(0); }
    }
    .pomo-dock-bounce {
      animation: pomo-dock-bounce 2.1s cubic-bezier(0.33, 0, 0.2, 1) infinite;
      box-shadow: 0 0 0 2.5px var(--pink), 0 8px 0 var(--paper-3) !important;
    }
  `;
  document.head.appendChild(s);
}
