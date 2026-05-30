/* global React, diary, SplitPane, InlineAdd, DelBtn */
// ===========================================================
// 할 일 — 위(2/3): 입력 + 모든 할 일
//          아래(1/3): 핀(!) · 반복 · 마감일 설정한 할 일 자동 표시
// • 행은 마스킹테이프 느낌 (연한 파스텔)
// • 메모는 (지금은) 표시하지 않음
// ===========================================================
const { useState, useEffect } = React;

function dateOf(ts) { return ts ? (ts.length >= 10 ? ts.slice(0, 10) : ts) : null; }
function fmtMD(iso) { if (!iso) return ""; const [, m, d] = iso.split("-").map(Number); return `${m}/${d}`; }

// 연한 파스텔 마스킹테이프 색 (행마다 순환)
const LIGHT_TAPE = [
  "#ffeaf2", "#fffbd1", "#e9f8d8", "#fde0e5", "#dcf4e3",
  "#efe8f8", "#dfeaf9", "#fbf0d8", "#ffe9da", "#e3f3ff",
];
const LIGHT_PAT = "radial-gradient(rgba(255,255,255,.7) 1.2px, transparent 1.3px) 0 0 / 10px 10px";
function lightTape(i, pinned) {
  if (pinned) return { background: `${LIGHT_PAT}, #fff5b8` };
  const c = LIGHT_TAPE[((i % LIGHT_TAPE.length) + LIGHT_TAPE.length) % LIGHT_TAPE.length];
  return { background: `${LIGHT_PAT}, ${c}` };
}

function recLabel(r) {
  if (!r) return "";
  if (r.frequency === "daily") return "매일";
  if (r.frequency === "weekdays") return "평일";
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  return (r.weeklyDays || []).map(d => DOW[d]).join("·") || "특정 요일";
}

function TodoView() {
  const { state, actions } = diary.useDiary();
  const [selId, setSel] = useState(null);
  const todayStr = diary.today();
  // 현재 보고 있는 날짜. null = 오늘.
  const [selectedDate, setSelectedDate] = useState(todayStr);
  // 필터 모드 — 'date': selectedDate 기반 (기존), 'all': 이번달 전체
  const [filterMode, setFilterMode] = useState("date");
  useEffect(() => { actions.generateRecurrences(); }, []);

  const items = diary.select.todosForCurrent(state);
  const isToday = selectedDate === todayStr;

  // 이번달 범위 — '전체' 모드에서 사용
  const monthPrefix = todayStr.slice(0, 8); // "YYYY-MM-"
  const inThisMonth = (d) => typeof d === "string" && d.startsWith(monthPrefix);
  // todo 가 이번달 범위에 걸리는지 (생성/마감/완료 중 하나라도)
  const inMonthRange = (t) => (
    inThisMonth(t.createdAt) ||
    (t.dueDate && inThisMonth(t.dueDate)) ||
    (t.completedAt && inThisMonth(t.completedAt.slice(0, 10)))
  );

  // 모드별 미완료 카운트 — 토글 뱃지에 표시
  const dateModeIncomplete = items.filter(t => !t.done && diary.matchesTodoDay(t, selectedDate, todayStr)).length;
  const allModeIncomplete = items.filter(t => !t.done && inMonthRange(t)).length;

  // 필터 — 모드에 따라
  const list = items.filter(t => {
    if (filterMode === "all") return inMonthRange(t);
    return diary.matchesTodoDay(t, selectedDate, todayStr);
  }).slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  const recById = Object.fromEntries(
    (state.recurrences ?? []).filter(r => r.projectId === state.currentProjectId).map(r => [r.id, r])
  );

  // 월간 달력 점
  const dueDates = new Set(
    items.filter(t => !t.done && t.dueDate).map(t => t.dueDate)
  );
  const doneDates = new Set(
    items.filter(t => t.done).map(t => diary.completionDay(t)).filter(Boolean)
  );

  const onPick = (id) => setSel(s => (s === id ? null : id));
  const clear = () => setSel(null);

  const onAdd = (text) => {
    // '전체' 모드에서 추가 — 오늘에 붙임 (마감 없음)
    if (filterMode === "all" || isToday) actions.addTodo(text);
    else actions.addTodo(text, { dueDate: selectedDate });
  };

  const dateLabel = isToday ? L("todo.today") : (window.i18n && window.i18n.fmtDate ? window.i18n.fmtDate(selectedDate) : selectedDate);
  const dateLabelShort = isToday ? L("todo.today") : fmtMD(selectedDate);
  const placeholder = filterMode === "all"
    ? L("todo.addPh")
    : (isToday ? L("todo.addPh") : `${fmtMD(selectedDate)} ${L("todo.addPhDate")}`);

  // 헤더 — 두 칸 세그먼트 토글 ([날짜] [전체])
  const headerToggle = (
    <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0 }}>
      <SegPill
        active={filterMode === "date"}
        onClick={() => setFilterMode("date")}
        icon="📅"
        label={dateLabelShort}
        count={dateModeIncomplete}
      />
      <SegPill
        active={filterMode === "all"}
        onClick={() => setFilterMode("all")}
        icon="📋"
        label="전체"
        count={allModeIncomplete}
      />
    </div>
  );

  return (
    <SplitPane
      topLabel={headerToggle}
      topRight={filterMode === "date" && !isToday && (
        <button onClick={() => setSelectedDate(todayStr)} style={{
          all: "unset", cursor: "pointer",
          padding: "2px 9px", borderRadius: 99,
          border: "1.1px solid var(--ink)", background: "var(--paper)",
          fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink)",
        }}>↩ {L("todo.backToday")}</button>
      )}
      top={
        <div onClick={clear}>
          <div style={{ marginBottom: 8 }} onClick={(e) => e.stopPropagation()}>
            <InlineAdd placeholder={placeholder} onAdd={onAdd} />
          </div>
          {list.map((t, i) => (
            <TodoRow key={t.id} t={t} actions={actions} recRule={recById[t.recurrenceId]} i={i}
              selected={selId === t.id} onPick={onPick} />
          ))}
          {list.length === 0 && (
            <div className="sk-cap" style={{ padding: "4px 2px" }}>
              {filterMode === "all"
                ? "이번달 할 일이 없어요"
                : (isToday ? L("todo.emptyToday") : L("todo.emptyDate", { d: fmtMD(selectedDate) }))}
            </div>
          )}
        </div>
      }
      bottomScroll={false}
      bottom={
        <TodoMonthCalendar
          dueDates={dueDates}
          doneDates={doneDates}
          selectedDate={filterMode === "date" ? selectedDate : null}
          onPick={(d) => { setSelectedDate(d); setFilterMode("date"); }}
        />
      }
    />
  );
}

// 헤더 세그먼트 알약 — sk-label 의 uppercase / 라벨 폰트를 셀프 리셋
function SegPill({ active, onClick, icon, label, count }) {
  return (
    <button onClick={onClick} style={{
      all: "unset", cursor: "pointer",
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 9px", borderRadius: 99,
      border: active ? "1.2px solid var(--ink)" : "1px solid var(--ink-soft)",
      background: active ? "var(--paper)" : "transparent",
      boxShadow: active ? "0 1.5px 0 var(--paper-3)" : "none",
      fontFamily: "var(--hand)", fontSize: 12,
      textTransform: "none", letterSpacing: "normal",
      color: active ? "var(--ink)" : "var(--ink-3)",
      minWidth: 0, flexShrink: 1,
    }}>
      <span style={{ fontSize: 11, flexShrink: 0 }}>{icon}</span>
      <span style={{
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        minWidth: 0,
      }}>{label}</span>
      <span style={{
        fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
        color: active ? "var(--ink)" : "var(--ink-3)",
        background: active ? "rgba(255,255,255,0.7)" : "transparent",
        padding: active ? "0 5px" : "0 2px", borderRadius: 99,
        border: active ? "1px solid rgba(40,51,63,0.2)" : "none",
        flexShrink: 0,
      }}>{count}</span>
    </button>
  );
}

// ---- 컴팩트 월간 달력 (할 일 탭 아래) ----
function TodoMonthCalendar({ dueDates, doneDates, selectedDate, onPick }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const todayStr = diary.today();

  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = cells.length / 7;
  const dows = (window.i18n && window.i18n.weekdays) ? window.i18n.weekdays() : ["일","월","화","수","목","금","토"];

  const prev = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  const ymLabel = (() => {
    const lng = window.i18n && window.i18n.get && window.i18n.get();
    if (lng === "en") return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month]} ${year}`;
    if (lng === "ko") return `${year}년 ${month + 1}월`;
    return `${year}年 ${month + 1}月`;
  })();

  return (
    <div style={{
      height: "100%", minHeight: 0, display: "flex", flexDirection: "column",
      border: "1.1px solid var(--ink)", borderRadius: 10, overflow: "hidden", background: "white",
    }}>
      {/* 헤더 */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
        padding: "4px 8px",
        background: "linear-gradient(180deg, color-mix(in srgb, var(--chrome,#a9cdf5) 42%, white), color-mix(in srgb, var(--chrome,#a9cdf5) 12%, white))",
        borderBottom: "1.1px solid var(--ink)",
      }}>
        <button onClick={prev} style={navBtn}>◀</button>
        <div style={{
          flex: 1, textAlign: "center",
          fontFamily: "var(--hand)", fontSize: 13, fontWeight: 700, color: "var(--ink)",
          cursor: "pointer",
        }} onClick={goToday}>{ymLabel}</div>
        <button onClick={next} style={navBtn}>▶</button>
      </div>
      {/* 요일 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", flexShrink: 0, background: "#f7f9fc" }}>
        {dows.map((w, i) => (
          <div key={i} style={{
            textAlign: "center", padding: "2px 0",
            fontFamily: "var(--mono)", fontSize: 10,
            color: i === 0 ? "#e06a7a" : (i === 6 ? "#5b8fd6" : "var(--ink-3)"),
          }}>{w}</div>
        ))}
      </div>
      {/* 날짜 그리드 */}
      <div style={{
        flex: 1, minHeight: 0, display: "grid",
        gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: `repeat(${rows},1fr)`,
      }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} style={{ borderTop: "1px solid #eef0f3", borderLeft: i % 7 === 0 ? "none" : "1px solid #eef0f3" }} />;
          const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDate;
          const hasDue = dueDates.has(ds);
          const hasDone = doneDates.has(ds);
          return (
            <button key={i} onClick={() => onPick(ds)} style={{
              all: "unset", cursor: "pointer", position: "relative",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
              borderTop: "1px solid #eef0f3",
              borderLeft: i % 7 === 0 ? "none" : "1px solid #eef0f3",
              background: isSelected ? "var(--hi-soft)" : "transparent",
              boxShadow: isSelected ? "inset 0 0 0 1.5px var(--ink)" : "none",
            }}>
              <span style={{
                width: 20, height: 20, display: "grid", placeItems: "center", borderRadius: "50%",
                fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: isToday ? 700 : 400,
                background: isToday ? "var(--point)" : "transparent",
                color: "var(--ink)",
              }}>{d}</span>
              <span style={{ display: "inline-flex", gap: 2, height: 4 }}>
                {hasDue && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#e06a7a" }} />}
                {hasDone && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#9aa7b8" }} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const navBtn = {
  all: "unset", cursor: "pointer",
  width: 22, height: 20, borderRadius: 4,
  display: "grid", placeItems: "center",
  fontSize: 10, color: "var(--ink-2)",
  background: "rgba(255,255,255,0.6)", border: "1px solid var(--ink-soft)",
};

// ---- 할 일 행 ----
// • selected: 그 행만 액션 아이콘 / 외곽선 / 드래그 활성
// • compact:  중요·예정 트레이용 (드래그 없음)
// • t.done:   취소선 + 회색
function TodoRow({ t, actions, recRule, i = 0, compact = false, selected = false, onPick }) {
  const [recOpen, setRecOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const showActions = selected;
  const showDrag = selected && !compact;

  const stop = (e) => e.stopPropagation();
  const onRowClick = (e) => { e.stopPropagation(); if (onPick) onPick(t.id); };

  const onDragStart = (e) => { e.dataTransfer.setData("text/todo-id", t.id); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    const fromId = e.dataTransfer.getData("text/todo-id");
    if (fromId && fromId !== t.id) actions.reorderTodoBefore(fromId, t.id);
  };

  return (
    <div
      onClick={onRowClick}
      draggable={showDrag}
      onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
      className="tape"
      style={{
        ...lightTape(i, t.pinned),
        padding: compact ? "5px 14px" : "7px 16px",
        marginBottom: compact ? 5 : 6,
        outline: selected ? "1.6px solid var(--ink)" : "none",
        outlineOffset: 2,
        opacity: t.done ? 0.7 : 1,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <button
          onClick={(e) => { stop(e); actions.toggleTodo(t.id); }}
          className={"sk-check" + (t.done ? " done" : "")}
          style={{ cursor: "pointer", flexShrink: 0 }}
          title={t.done ? "되돌리기" : "끝냄으로 표시"}
        />
        <span style={{
          flex: 1, minWidth: 0, fontFamily: "var(--hand)",
          fontSize: compact ? 14 : 15,
          color: t.done ? "var(--ink-3)" : "var(--ink)",
          textDecoration: t.done ? "line-through" : "none",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{t.title}</span>

        {/* 마감 뱃지 */}
        {t.dueDate && (
          <span title={`마감 ${t.dueDate}`} style={dueBadge}>{fmtMD(t.dueDate)}</span>
        )}
        {/* 반복 표시 */}
        {recRule && <span title={`반복 — ${recLabel(recRule)}`} style={{ fontSize: 12, color: "var(--ink-2)" }}>↻</span>}

        {/* 선택됐을 때만 액션 아이콘 */}
        {showActions && (
          <>
            <button onClick={(e) => { stop(e); actions.togglePin(t.id); }} title={t.pinned ? "핀 해제" : "핀(중요·예정으로 이동)"}
              style={{ ...iconBtn, color: t.pinned ? "#7a5a10" : "var(--ink-3)", fontWeight: t.pinned ? 800 : 400 }}>!</button>
            <button onClick={(e) => { stop(e); setDueOpen(o => !o); }} title="마감일" style={iconBtn}>📅</button>
            <button onClick={(e) => { stop(e); setRecOpen(o => !o); }} title="반복" style={{ ...iconBtn, color: recRule ? "var(--ink)" : "var(--ink-3)" }}>↻</button>
            {!compact && <span title="드래그로 이동" style={{ cursor: "grab", color: "var(--ink-3)", fontSize: 14, padding: "0 2px", userSelect: "none" }}>⋮⋮</span>}
            <DelBtn onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); actions.removeTodo(t.id); }} />
          </>
        )}
      </div>

      {/* 마감일 펼침 */}
      {dueOpen && showActions && (
        <div style={expanderRow} onClick={stop}>
          <input type="date" value={t.dueDate || ""} onChange={(e) => actions.setTodoDue(t.id, e.target.value)} style={dateInput} />
          {t.dueDate && <button onClick={(e) => { stop(e); actions.setTodoDue(t.id, null); setDueOpen(false); }} style={miniBtn}>지우기</button>}
          <button onClick={(e) => { stop(e); setDueOpen(false); }} style={miniBtn}>닫기</button>
        </div>
      )}

      {/* 반복 펼침 */}
      {recOpen && showActions && (
        <div onClick={stop}>
          <RecurrencePanel t={t} recRule={recRule} actions={actions} onClose={() => setRecOpen(false)} />
        </div>
      )}
    </div>
  );
}

function RecurrencePanel({ t, recRule, actions, onClose }) {
  const [freq, setFreq] = useState(recRule?.frequency || "daily");
  const [days, setDays] = useState(recRule?.weeklyDays || [1, 3, 5]);
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const toggleDay = (d) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  const apply = () => {
    const patch = { title: t.title, frequency: freq, weeklyDays: freq === "weekly" ? days : [] };
    if (recRule) actions.updateRecurrence(recRule.id, patch);
    else {
      const id = actions.addRecurrence(patch);
      actions.updateTodo(t.id, { recurrenceId: id });
    }
    onClose();
  };
  const remove = () => { if (recRule) actions.removeRecurrence(recRule.id); onClose(); };

  return (
    <div style={expanderRow}>
      <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
        {[["daily", "매일"], ["weekdays", "평일"], ["weekly", "특정 요일"]].map(([v, lbl]) => (
          <button key={v} onClick={() => setFreq(v)} style={{ ...chipBtn, background: freq === v ? "var(--hi)" : "var(--paper)" }}>{lbl}</button>
        ))}
        {freq === "weekly" && (
          <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
            {DOW.map((d, idx) => (
              <button key={d} onClick={() => toggleDay(idx)} style={{
                ...chipBtn, padding: "1px 7px",
                background: days.includes(idx) ? "var(--hi)" : "var(--paper)",
                color: idx === 0 ? "#e06a7a" : idx === 6 ? "#5b8fd6" : "var(--ink)",
              }}>{d}</button>
            ))}
          </div>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={apply} style={{ ...miniBtn, background: "var(--point)" }}>적용</button>
        {recRule && <button onClick={remove} style={{ ...miniBtn, color: "var(--bad)" }}>반복 해제</button>}
        <button onClick={onClose} style={miniBtn}>닫기</button>
      </div>
    </div>
  );
}

const sortBtn = {
  all: "unset", cursor: "pointer", padding: "3px 9px", borderRadius: 99,
  border: "1.1px solid var(--ink)", background: "var(--paper)",
  fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)",
};
const iconBtn = {
  all: "unset", cursor: "pointer", fontSize: 13, color: "var(--ink-2)",
  padding: "0 4px", lineHeight: 1, flexShrink: 0,
};
const dueBadge = {
  all: "unset", cursor: "pointer", padding: "1px 7px", borderRadius: 99,
  border: "1px solid rgba(40,51,63,.25)", background: "rgba(255,255,255,.55)",
  fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-2)", flexShrink: 0,
};
const expanderRow = {
  display: "flex", alignItems: "center", gap: 6, marginTop: 5,
  padding: "5px 8px", borderRadius: 8, background: "rgba(255,255,255,.55)",
  border: "1px dashed rgba(40,51,63,.25)",
};
const chipBtn = {
  all: "unset", cursor: "pointer", padding: "2px 9px", borderRadius: 99,
  border: "1.1px solid var(--ink)", background: "var(--paper)",
  fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)",
};
const miniBtn = {
  all: "unset", cursor: "pointer", padding: "1px 8px", borderRadius: 99,
  border: "1.1px solid var(--ink)", background: "var(--paper)",
  fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink)",
};
const dateInput = {
  border: "1px solid var(--ink-soft)", borderRadius: 6, padding: "2px 6px",
  fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", background: "var(--paper)",
};

window.TodoView = TodoView;
