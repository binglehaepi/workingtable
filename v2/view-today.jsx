/* global React, diary */
// ===========================================================
// 주간탭 — 주간 조망(7칸 격자) ↔ 하루 상세 슬라이드 전환
//   같은 창 안에서 가로 슬라이드. 모달/별창 없음.
//   할 일·작업시간·일기가 같은 YYYY-MM-DD 키로 묶임 (diary.select.dayBundle).
//   기분은 dist/asset/Sprite-0002.png 의 16x16 픽셀 타일을 사용.
// ===========================================================
const { useState, useEffect, useRef, useMemo } = React;

// ---- 날짜 유틸 ----
function pad2(n) { return String(n).padStart(2, "0"); }
function dateOnly(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtClock(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const h = d.getHours();
  const m = pad2(d.getMinutes());
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = ((h + 11) % 12) + 1;
  return `${ampm} ${h12}:${m}`;
}
function startOfWeekMonday(date) {
  const d = new Date(date);
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtSecondsHMS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}
function dDayLabel(target, base) {
  if (!target) return null;
  const a = new Date(target + "T00:00:00").getTime();
  const b = new Date(dateOnly(base) + "T00:00:00").getTime();
  const days = Math.round((a - b) / 86400000);
  if (days === 0) return "D-DAY";
  if (days > 0) return `D-${days}`;
  return `D+${-days}`;
}
function rangeLabel(weekStart) {
  const end = addDays(weekStart, 6);
  const lng = (window.i18n && window.i18n.get && window.i18n.get()) || "ko";
  const fmt = (d) => {
    if (lng === "en") return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getDate()}`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

// ---- 할 일 색상 (할일탭 색상과 연동) ----
// view-todo.jsx 와 동일한 팔레트를 따라간다. 마감일 우선, 핀이면 yellow, 완료면 회색.
function todoColor(t) {
  if (t.done) return "#c9d3e0";
  if (t.pinned) return "#fdff85";
  // dueDate 가 있으면 mint, 없으면 lavender
  if (t.dueDate) return "#9ef0c4";
  return "#d8cdf5";
}

// ---- 기분 이모티콘 (Sprite-0002.png · 6x4 · 16x16 타일) ----
// (col, row) — 0-indexed. 픽셀아트라 image-rendering: pixelated 로 키워서 표시.
const SPRITE_URL = "asset/Sprite-0002.png";
const SPRITE_COLS = 6;
const SPRITE_ROWS = 4;
const TILE = 16;
const MOODS = [
  { id: "great",  label: "반짝", col: 1, row: 0 }, // sparkle
  { id: "happy",  label: "좋아", col: 0, row: 1 }, // sun
  { id: "love",   label: "두근", col: 0, row: 0 }, // heart
  { id: "calm",   label: "잔잔", col: 5, row: 1 }, // sprout
  { id: "soso",   label: "그저", col: 1, row: 1 }, // cloud
  { id: "tired",  label: "지침", col: 4, row: 1 }, // moon
  { id: "sad",    label: "울적", col: 2, row: 1 }, // rain cloud
  { id: "stress", label: "꽉참", col: 2, row: 0 }, // exclamation
];
function MoodIcon({ mood, size = 28 }) {
  const m = MOODS.find(x => x.id === mood);
  if (!m) return null;
  const scale = size / TILE;
  return (
    <span style={{
      display: "inline-block", width: size, height: size, flexShrink: 0,
      backgroundImage: `url(${SPRITE_URL})`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: `-${m.col * TILE * scale}px -${m.row * TILE * scale}px`,
      backgroundSize: `${SPRITE_COLS * TILE * scale}px ${SPRITE_ROWS * TILE * scale}px`,
      imageRendering: "pixelated",
    }} />
  );
}

// ===========================================================
// 메인 — 슬라이드 컨테이너
// ===========================================================
function CalendarView() {
  // null 이면 주간 뷰, 문자열(YYYY-MM-DD)이면 하루 뷰
  const [openDate, setOpenDate] = useState(null);
  // 슬라이드 트랙용 — 닫혀도 잠시 하루 뷰가 살아있어야 슬라이드 애니가 보임
  const [stickyDate, setStickyDate] = useState(null);
  useEffect(() => {
    if (openDate) setStickyDate(openDate);
    else {
      const id = setTimeout(() => setStickyDate(null), 320);
      return () => clearTimeout(id);
    }
  }, [openDate]);

  const showDay = openDate != null;

  return (
    <div style={{
      height: "100%", padding: "8px 8px 8px", boxSizing: "border-box", background: "transparent",
    }}>
      <div style={{
        height: "100%", display: "flex", flexDirection: "column", minHeight: 0,
        background: "rgba(255,255,255,0.95)",
        border: "1.1px solid var(--ink)", borderRadius: 10,
        boxShadow: "0 2px 0 var(--paper-3)",
        overflow: "hidden", position: "relative",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", width: "200%",
          transform: showDay ? "translateX(-50%)" : "translateX(0)",
          transition: "transform 320ms cubic-bezier(.4,.0,.2,1)",
        }}>
          <div style={{ width: "50%", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <WeekPane onPickDay={(d) => setOpenDate(d)} />
          </div>
          <div style={{ width: "50%", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
            {stickyDate && (
              <DayPane
                date={stickyDate}
                onBack={() => setOpenDate(null)}
                onJump={(d) => setOpenDate(d)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================
// 주간 뷰 — 7칸 격자 + 하단 통계
// ===========================================================
function WeekPane({ onPickDay }) {
  const { state, actions } = diary.useDiary();
  const today = new Date();
  const todayStr = dateOnly(today);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(today));

  const mondayStr = dateOnly(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayStrings = days.map(dateOnly);

  // 그 주의 할 일 묶기
  const todos = (state.todos ?? []).filter(t => t.projectId === state.currentProjectId);
  const dueByDay = {};
  const doneByDay = {};
  dayStrings.forEach(d => { dueByDay[d] = []; doneByDay[d] = []; });
  todos.forEach(t => {
    dayStrings.forEach(d => {
      if (!diary.matchesTodoDay(t, d, todayStr)) return;
      if (t.done) doneByDay[d].push(t);
      else dueByDay[d].push(t);
    });
  });
  const workByDay = {};
  (state.workSessions ?? []).forEach(w => { if (dayStrings.includes(w.date)) workByDay[w.date] = w.minutes; });
  const retroByDay = {};
  (state.retros ?? []).forEach(r => { if (dayStrings.includes(r.date)) retroByDay[r.date] = r; });

  const dday = state.dday || {};

  const goPrev = () => setWeekStart(s => addDays(s, -7));
  const goNext = () => setWeekStart(s => addDays(s, 7));
  const goThis = () => setWeekStart(startOfWeekMonday(new Date()));
  const isThisWeek = mondayStr === dateOnly(startOfWeekMonday(new Date()));

  // 주간 통계
  const weekTotalMin = dayStrings.reduce((sum, d) => sum + (workByDay[d] || 0), 0);
  const weekDoneCnt = dayStrings.reduce((sum, d) => {
    const all = [...(dueByDay[d] || []), ...(doneByDay[d] || [])];
    return sum + all.filter(t => t.done).length;
  }, 0);
  const streak = computeRetroStreak(state.retros ?? []);

  return (
    <>
      {/* 타이틀바 */}
      <div style={{
        flexShrink: 0, padding: "6px 10px",
        display: "flex", alignItems: "center", gap: 6,
        background: "linear-gradient(180deg, color-mix(in srgb, var(--chrome,#a9cdf5) 42%, white) 0%, color-mix(in srgb, var(--chrome,#a9cdf5) 12%, white) 100%)",
        borderBottom: "1.1px solid var(--ink)",
      }}>
        <button onClick={goPrev} title={L("planner.prev")} style={gradNavBtn}>◀</button>
        <div style={{
          flex: 1, textAlign: "center",
          fontFamily: "var(--hand)", fontSize: 14, fontWeight: 700,
          color: "var(--ink)",
        }}>
          {rangeLabel(weekStart)}
        </div>
        <button onClick={goNext} title={L("planner.next")} style={gradNavBtn}>▶</button>
        {!isThisWeek && (
          <button onClick={goThis} title={L("planner.thisWeek")} style={pillBtn}>{L("planner.thisWeek")}</button>
        )}
      </div>

      {/* 2×4 격자 — 7요일 + 노트 한 칸 */}
      <div style={{
        flex: 1, minHeight: 0,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "repeat(4, 1fr)",
      }}>
        {[0,1,2,3,4,5,6].map(i => (
          <DayCell key={i}
            date={days[i]}
            dateStr={dayStrings[i]}
            labelKey={DAY_KEYS[i]}
            due={dueByDay[dayStrings[i]] || []}
            doneFloat={doneByDay[dayStrings[i]] || []}
            workMin={workByDay[dayStrings[i]] || 0}
            hasRetro={!!retroByDay[dayStrings[i]]}
            mood={retroByDay[dayStrings[i]]?.mood || null}
            ddayLabel={dday.date === dayStrings[i] ? dDayLabel(dday.date, today) : null}
            ddayName={dday.date === dayStrings[i] ? (dday.label || "디데이") : null}
            isToday={dayStrings[i] === todayStr}
            isFuture={dayStrings[i] > todayStr}
            onClick={() => onPickDay(dayStrings[i])}
            onToggleTodo={(id) => actions.toggleTodo(id)}
            colIdx={i % 2}
            rowIdx={Math.floor(i / 2)}
          />
        ))}
        {/* 8번째 칸 — 주간 노트 */}
        <WeekNotesCell
          mondayStr={mondayStr}
          notes={state.weekNotes?.[mondayStr] || ""}
          onChange={(text) => actions.setWeekNote(mondayStr, text)}
        />
      </div>

      {/* 푸터 — 주간 통계 (작업 / 완료 / 연속) */}
      <WeekStatsFooter weekTotalMin={weekTotalMin} weekDoneCnt={weekDoneCnt} streak={streak} />
    </>
  );
}

// 오늘부터 거꾸로 회고가 있는 날 카운트
function computeRetroStreak(retros) {
  const set = new Set(retros.map(r => r.date));
  let n = 0;
  let cur = new Date();
  cur.setHours(0,0,0,0);
  while (set.has(dateOnly(cur))) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

const DAY_KEYS = [
  "planner.mon", "planner.tue", "planner.wed", "planner.thu",
  "planner.fri", "planner.sat", "planner.sun",
];

// ---- 요일 칸 — 2×4 격자용 ----
function DayCell({ date, labelKey, due, doneFloat, workMin, hasRetro, mood,
                  ddayLabel, ddayName, isToday, isFuture, onClick, onToggleTodo,
                  colIdx, rowIdx }) {
  const allItems = [...due, ...doneFloat];
  const dayName = L(labelKey);

  return (
    <div onClick={onClick} title={`${date.getMonth()+1}/${date.getDate()} 자세히`} style={{
      cursor: "pointer",
      borderRight: colIdx === 0 ? "1px solid var(--ink-soft)" : "none",
      borderBottom: rowIdx < 3 ? "1px solid var(--ink-soft)" : "none",
      padding: "6px 8px 16px",
      display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
      background: isToday
        ? "color-mix(in srgb, var(--point,#fdff85) 30%, white)"
        : (isFuture ? "transparent" : "rgba(255,255,255,0.4)"),
      transition: "background .15s",
      position: "relative",
    }}>
      {/* 헤더 — 요일명 + 날짜 + 오늘/디데이 뱃지 */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <span style={{
          fontFamily: "var(--hand)", fontSize: 12.5, fontWeight: 700, color: "var(--ink)",
        }}>{dayName}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-3)" }}>
          {date.getMonth() + 1}/{date.getDate()}
        </span>
        {isToday && (
          <span style={{
            fontFamily: "var(--mono)", fontSize: 8.5, color: "var(--ink)",
            background: "var(--point)", padding: "0 5px", borderRadius: 99,
            border: "1px solid var(--ink)",
          }}>오늘</span>
        )}
        {ddayLabel && (
          <span title={ddayName} style={{
            fontFamily: "var(--mono)", fontSize: 8.5, color: "var(--ink)",
            background: "#ffd0d8", padding: "0 5px", borderRadius: 99,
            border: "1px solid var(--ink)",
          }}>★{ddayLabel}</span>
        )}
        {hasRetro && (
          <span title="일기 있음" style={{
            marginLeft: "auto",
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--pink)", border: "1px solid var(--ink)",
            flexShrink: 0,
          }} />
        )}
      </div>

      {/* 항목 — 체크박스 + 텍스트 (셀 내부 스크롤) */}
      <div onClick={(e) => e.stopPropagation()} style={{
        flex: 1, minHeight: 0, marginTop: 4,
        overflowY: "auto", overflowX: "hidden",
        paddingRight: 2,
      }}>
        {allItems.length === 0 ? (
          <div style={{ fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink-3)" }}>·</div>
        ) : (
          allItems.map(t => (
            <TodoMiniLine key={t.id} t={t} onToggle={() => onToggleTodo(t.id)} />
          ))
        )}
      </div>

      {/* 좌하단 — 작업시간 */}
      {!!workMin && (
        <div style={{
          position: "absolute", left: 8, bottom: 4,
          display: "inline-flex", alignItems: "center", gap: 2,
          fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--ink-2)",
          pointerEvents: "none",
        }}>
          <span>🕒</span>
          <span>{workMin >= 60 ? `${Math.floor(workMin/60)}h ${workMin%60 ? (workMin%60)+"m" : ""}` : `${workMin}m`}</span>
        </div>
      )}

      {/* 우하단 — 기분 */}
      {mood && (
        <div style={{ position: "absolute", right: 4, bottom: 4, opacity: 0.95 }}>
          <MoodIcon mood={mood} size={14} />
        </div>
      )}
    </div>
  );
}

// 요일 칸 안 체크박스 행 (텍스트는 최대 2줄까지 보이고 그 이상은 셀 스크롤로 노출)
function TodoMiniLine({ t, onToggle }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 5,
      padding: "1.5px 0",
      fontFamily: "var(--hand)", fontSize: 11,
      lineHeight: 1.3,
      color: t.done ? "var(--ink-3)" : "var(--ink)",
    }}>
      <button onClick={(e) => { e.stopPropagation(); onToggle(); }} title={t.done ? "되돌리기" : "끝냄으로"} style={{
        all: "unset", cursor: "pointer", flexShrink: 0,
        width: 11, height: 11, marginTop: 2,
        border: "1px solid var(--ink)", borderRadius: 2,
        background: t.done ? "var(--ink)" : "transparent",
        display: "grid", placeItems: "center",
        fontSize: 8, color: "#fff", lineHeight: 1,
      }}>{t.done ? "✓" : ""}</button>
      <span style={{
        flex: 1, minWidth: 0,
        textDecoration: t.done ? "line-through" : "none",
        wordBreak: "break-word",
      }}>{t.title}</span>
    </div>
  );
}

// 8번째 칸 — 주간 노트 (월요일 키 기준 저장)
function WeekNotesCell({ mondayStr, notes, onChange }) {
  const [local, setLocal] = useState(notes);
  const lastSentRef = useRef(notes);
  // 주가 바뀌면 새 값으로 동기화
  useEffect(() => { setLocal(notes); lastSentRef.current = notes; }, [mondayStr, notes]);
  // 디바운스 저장
  useEffect(() => {
    const id = setTimeout(() => {
      if (local !== lastSentRef.current) {
        onChange(local);
        lastSentRef.current = local;
      }
    }, 400);
    return () => clearTimeout(id);
  }, [local]);

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      padding: "6px 8px 8px",
      display: "flex", flexDirection: "column", minHeight: 0,
      background: "color-mix(in srgb, var(--chrome,#a9cdf5) 14%, white)",
    }}>
      <div style={{
        fontFamily: "var(--hand)", fontSize: 12.5, fontWeight: 700,
        color: "var(--ink)", flexShrink: 0,
      }}>
        Notes:
      </div>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder=""
        style={{
          flex: 1, minHeight: 0, marginTop: 4,
          border: 0, outline: "none", resize: "none",
          background: "transparent",
          fontFamily: "var(--hand)", fontSize: 11.5, lineHeight: 1.4,
          color: "var(--ink)", padding: 0,
        }}
      />
    </div>
  );
}

// 푸터 — 주간 통계 (작업 / 완료 / 연속 — 세 칩 가로 배치)
function WeekStatsFooter({ weekTotalMin, weekDoneCnt, streak }) {
  const h = Math.floor(weekTotalMin / 60);
  const m = weekTotalMin % 60;
  const totalLabel = h > 0 ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return (
    <div style={{
      flexShrink: 0, padding: "7px 8px 8px",
      borderTop: "1.1px solid var(--ink)",
      background: "linear-gradient(180deg, color-mix(in srgb, var(--chrome,#a9cdf5) 40%, white) 0%, color-mix(in srgb, var(--chrome,#a9cdf5) 14%, white) 100%)",
      display: "flex", alignItems: "center", gap: 5,
    }}>
      <StatChip label="작업" value={totalLabel} accent="#9ef0c4" />
      <StatChip label="완료" value={`${weekDoneCnt}`} accent="#a9cdf5" />
      <StatChip label="연속" value={`${streak}일`} accent="#ffc7d4" />
    </div>
  );
}

function StatChip({ label, value, accent }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", gap: 4,
      padding: "2.5px 8px", borderRadius: 999,
      background: "rgba(255,255,255,0.75)",
      border: "1px solid var(--ink-soft)",
      minWidth: 0,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: accent, border: "0.7px solid var(--ink)",
        flexShrink: 0,
      }} />
      <span style={{ fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink-2)", flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1 }} />
      <span style={{
        fontFamily: "var(--mono)", fontSize: 11.5, fontWeight: 700, color: "var(--ink)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{value}</span>
    </div>
  );
}

// ===========================================================
// 하루 상세 뷰 — 창 전체 폭 활용
// ===========================================================
function DayPane({ date, onBack, onJump }) {
  const { state, actions } = diary.useDiary();
  const bundle = diary.select.dayBundle(state, date);
  const isToday = date === diary.today();
  const dDateObj = parseDate(date);
  const dow = ["일","월","화","수","목","금","토"][dDateObj.getDay()];

  // 일기 본문 — 자동 저장 (디바운스)
  const [text, setText] = useState(bundle.retro?.text ?? "");
  const dirtyRef = useRef(false);
  // 날짜 바뀔 때 폼 리셋
  useEffect(() => {
    setText(bundle.retro?.text ?? "");
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // 자동 저장 (text 변경 후 500ms) — mood/good/bad는 store의 최신값 유지
  useEffect(() => {
    if (!dirtyRef.current) return;
    const id = setTimeout(() => {
      const latest = diary.getState().retros.find(r => r.date === date);
      actions.saveRetro({
        date, text,
        good: latest?.good ?? "",
        bad:  latest?.bad  ?? "",
        mood: latest?.mood ?? null,
      });
      dirtyRef.current = false;
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const onTextChange = (e) => { dirtyRef.current = true; setText(e.target.value); };

  const goPrevDay = () => onJump(dateOnly(addDays(dDateObj, -1)));
  const goNextDay = () => onJump(dateOnly(addDays(dDateObj, 1)));

  const totalSec = Math.max(bundle.workMinutes * 60, bundle.itemSeconds);
  const endClock = bundle.workEndTs ? fmtClock(bundle.workEndTs) : (isToday ? fmtClock(Date.now()) : null);

  return (
    <>
      {/* 타이틀바 — 뒤로 + 날짜 + 좌우 이동 */}
      <div style={{
        flexShrink: 0, padding: "6px 8px",
        display: "flex", alignItems: "center", gap: 4,
        background: "linear-gradient(180deg, color-mix(in srgb, var(--chrome,#a9cdf5) 42%, white) 0%, color-mix(in srgb, var(--chrome,#a9cdf5) 12%, white) 100%)",
        borderBottom: "1.1px solid var(--ink)",
      }}>
        <button onClick={onBack} title="주간으로" style={{
          ...gradNavBtn, width: "auto", padding: "0 9px", fontSize: 11,
          fontFamily: "var(--hand)", fontWeight: 700,
        }}>‹ 주간</button>
        <span style={{ flex: 1 }} />
        <button onClick={goPrevDay} title="이전 날" style={gradNavBtn}>‹</button>
        <div style={{
          padding: "0 8px",
          fontFamily: "var(--hand)", fontSize: 14, fontWeight: 700, color: "var(--ink)",
          whiteSpace: "nowrap",
        }}>
          {dDateObj.getMonth() + 1}월 {dDateObj.getDate()}일 ({dow})
          {isToday && <span style={{
            marginLeft: 5, fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink)",
            background: "var(--point)", padding: "0 5px", borderRadius: 99,
            border: "1px solid var(--ink)", verticalAlign: "middle",
          }}>오늘</span>}
        </div>
        <button onClick={goNextDay} title="다음 날" style={gradNavBtn}>›</button>
        <span style={{ flex: 1 }} />
      </div>

      {/* 본문 — 스크롤 */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
        padding: "10px 12px 14px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {/* 끝낸 일 */}
        <Section
          title="끝낸 일"
          badge={`${bundle.doneCount} / ${bundle.totalCount}`}
        >
          {bundle.items.length === 0 ? (
            <Empty text="이 날 할 일이 없었어요" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {bundle.items.map(t => (
                <TodoLine key={t.id} t={t} onToggle={() => actions.toggleTodo(t.id)} />
              ))}
            </div>
          )}
        </Section>

        {/* 작업시간 + 가장 많이 들은 곡 — 레트로 타이머 카드 */}
        <TimerCard
          totalSec={totalSec}
          workMinutes={bundle.workMinutes}
          topSong={bundle.topSong}
          isToday={isToday}
        />

        {/* 오늘의 기록 — 일기장 노트 스타일 */}
        <Notebook
          date={date}
          dateObj={dDateObj}
          dow={dow}
          endClock={endClock}
          mood={bundle.retro?.mood || null}
          onMoodChange={(m) => actions.setMood(date, m)}
          text={text}
          onTextChange={onTextChange}
          isToday={isToday}
        />
      </div>
    </>
  );
}

// ===========================================================
// 레트로 타이머 카드 — 큰 디스플레이 + 가장 많이 들은 곡
// ===========================================================
function TimerCard({ totalSec, workMinutes, topSong, isToday }) {
  return (
    <div style={{
      position: "relative",
      padding: "12px 14px 11px",
      background: "linear-gradient(180deg, #2a3340 0%, #1c232e 100%)",
      border: "1.4px solid var(--ink)", borderRadius: 12,
      boxShadow: "0 3px 0 var(--paper-3), inset 0 1px 0 rgba(255,255,255,0.1)",
      overflow: "hidden",
    }}>
      {/* 스캔라인 텍스처 — 옛 LCD/CRT 느낌 */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px)",
      }} />

      <div style={{
        display: "flex", alignItems: "baseline", gap: 8, position: "relative",
      }}>
        <span style={{
          fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
          color: "#9ef0c4", letterSpacing: "0.18em",
        }}>WORK TIMER</span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: "var(--mono)", fontSize: 9,
          color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em",
        }}>{isToday ? "● LIVE" : "REC"}</span>
      </div>

      <div style={{
        marginTop: 6, position: "relative",
        fontFamily: "var(--mono)", fontSize: 32, fontWeight: 700,
        color: "#bafff0", letterSpacing: "0.08em",
        textShadow: "0 0 8px rgba(186,255,240,0.5), 0 0 2px rgba(186,255,240,0.8)",
        lineHeight: 1,
      }}>
        {fmtSecondsHMS(totalSec)}
      </div>

      <div style={{
        marginTop: 8, position: "relative",
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 9px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 7,
      }}>
        <span style={{ fontSize: 11, color: "#ffc7d4" }}>♫</span>
        {topSong ? (
          <>
            <span style={{
              flex: 1, minWidth: 0,
              fontFamily: "var(--hand)", fontSize: 12,
              color: "rgba(255,255,255,0.95)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{topSong.title || "(제목 없음)"}</span>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
              color: "#fdff85", flexShrink: 0,
            }}>×{topSong.count}</span>
          </>
        ) : (
          <span style={{
            flex: 1, fontFamily: "var(--hand)", fontSize: 11,
            color: "rgba(255,255,255,0.5)", fontStyle: "italic",
          }}>들은 곡이 없어요</span>
        )}
      </div>
    </div>
  );
}

// ===========================================================
// 일기장 노트 — 가로 줄/날짜/작업종료 시간
// ===========================================================
function Notebook({ date, dateObj, dow, endClock, mood, onMoodChange, text, onTextChange, isToday }) {
  const LH = 28;             // 줄 간격
  const MARGIN_L = 32;       // 좌측 빨간 마진선
  const ko = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${dow})`;

  // 줄 패턴 — 가로 라인 (밝은 청회색)
  const rules = `repeating-linear-gradient(to bottom, transparent 0, transparent ${LH - 1}px, #b8d0e8 ${LH - 1}px, #b8d0e8 ${LH}px)`;

  return (
    <div style={{
      position: "relative",
      background: "#fdfbf2",                            // 미색 종이톤
      border: "1.4px solid var(--ink)", borderRadius: 10,
      boxShadow: "0 3px 0 var(--paper-3), 0 6px 14px -8px rgba(40,51,63,0.18)",
      overflow: "hidden",
    }}>
      {/* 위쪽 펀치홀 띠 */}
      <div style={{
        height: 12, background: "#f5ebd6",
        borderBottom: "1px dashed #c9b88f",
        display: "flex", alignItems: "center", justifyContent: "space-around",
        padding: "0 14px",
      }}>
        {[0,1,2,3,4,5].map(i => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "#d8c69a", boxShadow: "inset 0 1px 0 rgba(0,0,0,0.15)",
          }} />
        ))}
      </div>

      {/* 헤더 — 날짜 + 기분 한 줄 */}
      <div style={{
        padding: "9px 12px 8px",
        borderBottom: "1px dashed #d6c89c",
        background: "linear-gradient(180deg, rgba(255,255,255,0.6), transparent)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{
          flexShrink: 0,
          fontFamily: "var(--hand)", fontSize: 14, fontWeight: 700, color: "#5a4a30",
        }}>
          <span style={{ fontSize: 11, color: "#9b8453", marginRight: 4 }}>DATE</span>
          {ko}
        </div>
        <MoodRow value={mood} onChange={onMoodChange} />
      </div>

      {/* 줄친 종이 */}
      <div style={{
        position: "relative",
        paddingLeft: MARGIN_L,
      }}>
        {/* 좌측 빨간 마진선 */}
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: MARGIN_L - 1,
          width: 1, background: "#e58aa0",
        }} />
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: MARGIN_L - 4,
          width: 1, background: "rgba(229,138,160,0.3)",
        }} />

        <textarea
          value={text}
          onChange={onTextChange}
          placeholder="오늘의 일기..."
          rows={7}
          style={{
            display: "block", width: "100%", boxSizing: "border-box",
            border: 0, outline: "none", resize: "vertical",
            background: rules,
            backgroundAttachment: "local",
            paddingTop: 4, paddingRight: 12, paddingBottom: 8, paddingLeft: 6,
            minHeight: LH * 6 + 4,
            fontFamily: '"Gaegu", "Caveat", var(--hand)',
            fontSize: 16,
            lineHeight: `${LH}px`,
            color: "#2a3340",
            letterSpacing: "0.01em",
          }}
        />
      </div>

      {/* 푸터 — 작업 종료 시간 */}
      <div style={{
        padding: "6px 12px 7px",
        borderTop: "1px dashed #d6c89c",
        background: "linear-gradient(180deg, transparent, rgba(245,235,214,0.7))",
        display: "flex", alignItems: "center", gap: 6,
        fontFamily: "var(--hand)", fontSize: 11, color: "#7a6543",
      }}>
        <span style={{ fontSize: 10 }}>⌛</span>
        <span>작업 종료</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "#5a4a30" }}>
          {endClock ? endClock : "—"}
        </span>
      </div>
    </div>
  );
}

// 기분 — 한 줄 가로 배치 (자그마한 아이콘)
function MoodRow({ value, onChange }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      display: "flex", gap: 3, justifyContent: "flex-end",
      overflowX: "auto",
    }}>
      {MOODS.map(m => {
        const active = value === m.id;
        return (
          <button key={m.id} onClick={() => onChange(active ? null : m.id)} title={m.label} style={{
            all: "unset", cursor: "pointer", flexShrink: 0,
            display: "grid", placeItems: "center",
            width: 24, height: 24, borderRadius: 6,
            background: active ? "color-mix(in srgb, var(--point,#fdff85) 70%, white)" : "transparent",
            border: active ? "1.2px solid var(--ink)" : "1px solid transparent",
            boxShadow: active ? "0 1.5px 0 var(--paper-3)" : "none",
            transition: "background .08s, border-color .08s",
            opacity: active ? 1 : 0.55,
          }}>
            <MoodIcon mood={m.id} size={18} />
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, badge, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 5 }}>
        <div style={{
          fontFamily: "var(--hand)", fontSize: 13, fontWeight: 700,
          color: "var(--ink)", letterSpacing: "0.02em",
        }}>{title}</div>
        {badge != null && (
          <span style={{
            fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)",
            background: "var(--paper-2)", padding: "0 6px", borderRadius: 99,
            border: "1px solid var(--ink-soft)",
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}
function Empty({ text }) {
  return (
    <div style={{
      padding: "16px 12px", textAlign: "center",
      fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink-3)",
      background: "var(--paper-2)", border: "1.1px dashed var(--ink-soft)",
      borderRadius: 10,
    }}>{text}</div>
  );
}
function TodoLine({ t, onToggle }) {
  const mins = Math.round((t.trackedSeconds || 0) / 60);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "7px 9px",
      background: "var(--paper)",
      border: "1.1px solid var(--ink)", borderRadius: 9,
      boxShadow: "0 1.5px 0 var(--paper-3)",
    }}>
      <button onClick={onToggle} title={t.done ? "되돌리기" : "끝냄으로"} style={{
        all: "unset", cursor: "pointer", flexShrink: 0,
        width: 16, height: 16, borderRadius: 4,
        border: "1.1px solid var(--ink)",
        background: t.done ? "var(--ink)" : "transparent",
        display: "grid", placeItems: "center",
        fontSize: 10, color: "#fff",
      }}>{t.done ? "✓" : ""}</button>
      <span style={{
        width: 9, height: 9, borderRadius: "50%",
        background: todoColor(t), border: "0.8px solid var(--ink)", flexShrink: 0,
      }} />
      <span style={{
        flex: 1, minWidth: 0, fontFamily: "var(--hand)", fontSize: 13,
        color: t.done ? "var(--ink-3)" : "var(--ink)",
        textDecoration: t.done ? "line-through" : "none",
        wordBreak: "break-word",
      }}>{t.title}</span>
      {mins > 0 && (
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-2)", flexShrink: 0 }}>
          {mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`}
        </span>
      )}
    </div>
  );
}

// ---- 공통 버튼 스타일 ----
const gradNavBtn = {
  all: "unset", cursor: "pointer",
  width: 26, height: 22, borderRadius: 5,
  display: "grid", placeItems: "center",
  fontSize: 10, color: "var(--ink)",
  background: "linear-gradient(180deg, color-mix(in srgb, var(--chrome,#a9cdf5) 42%, white) 0%, color-mix(in srgb, var(--chrome,#a9cdf5) 12%, white) 100%)",
  border: "1.1px solid var(--ink)",
  boxShadow: "0 1px 0 var(--paper-3)",
};
const pillBtn = {
  all: "unset", cursor: "pointer",
  padding: "2px 9px", borderRadius: 99,
  fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink)",
  border: "1.1px solid var(--ink)", background: "var(--paper)",
};

window.CalendarView = CalendarView;
