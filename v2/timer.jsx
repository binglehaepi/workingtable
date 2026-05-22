/* global React, diary, InlineAdd, DelBtn */
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

function randTip() {
  const tips = window.i18n.tips();
  return tips[Math.floor(Math.random() * tips.length)];
}

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

// ---- 작업 시간 (프로그램 켜둔 활동 시간 누적) — 00 H 00 M ----
function WorkTime() {
  const { state } = diary.useDiary();
  const min = diary.select.workMinutesToday(state);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setBlink(b => !b), 1100);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
        background: "#ff5e5e", opacity: blink ? 0.95 : 0.6,
        transition: "opacity .5s ease",
      }} />
      <span style={{ fontSize: 9.5, letterSpacing: 1, color: "var(--ink-2)" }}>WORKING</span>
      <span>{pad(h)}</span>
      <span style={{ fontSize: 10, opacity: .6 }}>H</span>
      <span>{pad(m)}</span>
      <span style={{ fontSize: 10, opacity: .6 }}>M</span>
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
  const [open, setOpen] = useState(false);
  const diff = ddayDiff(dday.date);
  const dayNum = dday.date ? new Date(dday.date + "T00:00:00").getDate() : null;

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => setOpen(o => !o)} title={dday.label || L("dday.title")} style={{
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
  const [err, setErr] = useState("");

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

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => music.prev()} title={L("music.prev")} style={pbBtn}>⏮</button>
        <button onClick={() => music.toggle()} title={ms.playing ? L("music.pause") : L("music.play")} style={pbBtn}>
          {ms.playing ? "⏸" : "▶"}
        </button>
        <button onClick={() => music.next()} title={L("music.nextTrack")} style={pbBtn}>⏭</button>
        <div className="marquee" style={{
          flex: 1, height: 20, lineHeight: "20px",
          borderRadius: 6, padding: "0 4px",
          background: "rgba(40,51,63,0.92)",
          color: "#9be15d", fontFamily: "var(--mono)", fontSize: 12,
        }}>
          <span className="marquee-inner">{label}　♫　{label}</span>
        </div>
        <button onClick={() => setOpen(o => !o)} title={L("music.playlist")} style={pbBtn}>{open ? "▾" : "+"}</button>
      </div>

      {/* 펼침: 곡 추가 + 목록 (위로 팝오버) */}
      {open && (
        <div className="sk-box" style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 6, padding: 10, background: "var(--paper)",
          boxShadow: "0 4px 0 var(--paper-3)", zIndex: 28,
        }}>
          <div className="sk-label" style={{ marginBottom: 6 }}>{L("music.playlist")}</div>
          <InlineAdd placeholder={L("music.paste")} onAdd={add} />
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
                    <button onClick={() => music.play(t.videoId)} title={L("music.play")} style={{
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
    <button onClick={onClick} title={running ? L("timer.clickPause") : L("timer.clickResume")} style={{
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
const ctrlBtn = {
  all: "unset", cursor: "pointer",
  padding: "3px 12px", borderRadius: 99,
  border: "1.1px solid var(--ink)",
  background: "var(--paper)",
  fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
};

// ---- 시스템 알림 발사 ----
function fireNotification(title, body, granted) {
  if (granted && "Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body,
        icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='28' fill='%23ffc7d4' stroke='%238a6a5e' stroke-width='2'/><text x='32' y='42' text-anchor='middle' font-size='32' fill='%238a6a5e'>♡</text></svg>",
        tag: "vibe-diary-stretch",
        silent: false,
      });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 10000);
    } catch (e) {
      console.warn("notification failed", e);
    }
  }
}

window.Timer = Timer;
