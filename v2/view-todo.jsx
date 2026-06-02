/* global React, diary, SplitPane, InlineAdd, DelBtn, openExternalUrl, PomodoroBarButton */
// ===========================================================
// 할 일 — 위(2/3): 입력 + 모든 할 일
//          아래(1/3): 핀(!) · 반복 · 마감일 설정한 할 일 자동 표시
// • 행은 마스킹테이프 느낌 (연한 파스텔)
// • 메모는 (지금은) 표시하지 않음
// ===========================================================
const { useState, useEffect } = React;

function dateOf(ts) { return ts ? (ts.length >= 10 ? ts.slice(0, 10) : ts) : null; }
function fmtMD(iso) { if (!iso) return ""; const [, m, d] = iso.split("-").map(Number); return `${m}/${d}`; }
function normalizedPeriod(t) {
  const a = t.startDate || null;
  const b = t.endDate || null;
  if (!a && !b) return null;
  const start = a || b;
  const end = b || a;
  return start <= end ? { start, end } : { start: end, end: start };
}
function isInTodoPeriod(t, day) {
  const p = normalizedPeriod(t);
  return !!p && p.start <= day && day <= p.end;
}
function todoMatchesDay(t, day, today) {
  return diary.matchesTodoDay(t, day, today);
}
function fmtMonthLabel(iso) {
  const m = parseInt(iso.slice(5, 7), 10);
  const lng = window.i18n?.get?.() || "ko";
  if (lng === "en") return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  if (lng === "ja" || lng === "zh") return `${m}月`;
  return `${m}월`;
}
function periodLabel(t) {
  const p = normalizedPeriod(t);
  if (!p) return "";
  return p.start === p.end ? fmtMD(p.start) : `${fmtMD(p.start)}-${fmtMD(p.end)}`;
}
function addDaysIso(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
function isTextEditingTarget(target) {
  if (!target) return false;
  const tag = (target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable || !!target.closest?.("[contenteditable='true']");
}
function todoClipboardText(todo) {
  if (!todo) return "";
  const lines = [todo.title || ""];
  (todo.subTasks || []).forEach(st => {
    const mark = st.done ? "[x]" : "[ ]";
    const link = st.linkUrl ? ` ${st.linkUrl}` : "";
    lines.push(`  - ${mark} ${st.title || ""}${link}`);
  });
  return lines.filter(Boolean).join("\n");
}
async function writeClipboardText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}
async function readClipboardText() {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch (_) {}
  return "";
}

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
  if (r.frequency === "daily") return L("todo.recDaily");
  if (r.frequency === "weekdays") return L("todo.recWeekdays");
  const DOW = (window.i18n && window.i18n.weekdays) ? window.i18n.weekdays() : ["일", "월", "화", "수", "목", "금", "토"];
  return (r.weeklyDays || []).map(d => DOW[d]).join("·") || L("todo.specificDays");
}

// 달력 영역 높이 — 1주 단위로 스냅. (헤더+요일행+컨테이너 보더+패딩 ≈ 70px, 주 한 행 ≈ 30px)
const CAL_WEEK_PX = 30;
const CAL_BASE_PX = 70;
const CAL_MIN_WEEKS = 1;
const CAL_MAX_WEEKS = 6;
const CAL_STORAGE_KEY = "vibe.todoCalendarHeight";
function calSnap(h) {
  const weeks = Math.round((h - CAL_BASE_PX) / CAL_WEEK_PX);
  const clamped = Math.max(CAL_MIN_WEEKS, Math.min(CAL_MAX_WEEKS, weeks));
  return CAL_BASE_PX + clamped * CAL_WEEK_PX;
}

function TodoView({ tweaks } = {}) {
  const showPomodoro = tweaks?.showPomodoro ?? false;
  const { state, actions } = diary.useDiary();
  const [selId, setSel] = useState(null);
  const undoStackRef = React.useRef([]);
  const redoStackRef = React.useRef([]);
  const copiedTodoRef = React.useRef(null);
  const todayStr = diary.today();
  // 현재 보고 있는 날짜. null = 오늘.
  const [selectedDate, setSelectedDate] = useState(todayStr);
  // 필터 모드 — 'date': selectedDate 기반 (기존), 'all': 이번달 전체
  const [filterMode, setFilterMode] = useState("date");
  // 달력 영역 높이 — 저장된 값 복원, 없으면 4주 기본
  const [calHeight, setCalHeight] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(CAL_STORAGE_KEY) || "", 10);
      return Number.isFinite(v) ? calSnap(v) : calSnap(CAL_BASE_PX + 4 * CAL_WEEK_PX);
    } catch (_) { return CAL_BASE_PX + 4 * CAL_WEEK_PX; }
  });
  const onCalResize = (h) => {
    const snapped = calSnap(h);
    setCalHeight(snapped);
    try { localStorage.setItem(CAL_STORAGE_KEY, String(snapped)); } catch (_) {}
  };
  useEffect(() => { actions.generateRecurrences(); }, []);

  const items = diary.select.todosForCurrent(state);
  const isToday = selectedDate === todayStr;

  // 이번달 범위 — '전체' 모드에서 사용
  const monthPrefix = todayStr.slice(0, 8); // "YYYY-MM-"
  const inThisMonth = (d) => typeof d === "string" && d.startsWith(monthPrefix);
  // todo 가 이번달 범위에 걸리는지 (마감/기간/완료 기준 — 생성일만으로는 포함하지 않음)
  const inMonthRange = (t) => {
    if (t.dueDate && inThisMonth(t.dueDate)) return true;
    const p = normalizedPeriod(t);
    if (p) {
      const monthStart = monthPrefix + "01";
      const monthEnd = monthPrefix + "31";
      return p.start <= monthEnd && p.end >= monthStart;
    }
    if (t.completedAt && inThisMonth(t.completedAt.slice(0, 10))) return true;
    if (!t.dueDate && !p && inThisMonth(t.createdAt)) return true;
    return false;
  };

  // 모드별 미완료 카운트 — 토글 뱃지에 표시
  const dateModeIncomplete = items.filter(t => !t.done && todoMatchesDay(t, selectedDate, todayStr)).length;
  const allModeIncomplete = items.filter(t => !t.done && inMonthRange(t)).length;

  // 필터 — 모드에 따라
  const list = items.filter(t => {
    if (filterMode === "all") return inMonthRange(t);
    return todoMatchesDay(t, selectedDate, todayStr);
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
  const dueDates = new Set(items.filter(t => !t.done && t.dueDate).map(t => t.dueDate));
  items.filter(t => !t.done).forEach(t => {
    const p = normalizedPeriod(t);
    if (!p) return;
    let d = p.start;
    for (let i = 0; i < 370 && d <= p.end; i += 1) {
      dueDates.add(d);
      d = addDaysIso(d, 1);
    }
  });
  const doneDates = new Set(
    items.filter(t => t.done).map(t => diary.completionDay(t)).filter(Boolean)
  );

  const onPick = (id) => setSel(s => (s === id ? null : id));
  const clear = () => setSel(null);
  const makeHistorySnapshot = React.useCallback(() => {
    const s = diary.getState();
    return {
      todos: clonePlain(s.todos || []),
      recurrences: clonePlain(s.recurrences || []),
      selId,
    };
  }, [selId]);
  const pushUndo = React.useCallback(() => {
    undoStackRef.current = [...undoStackRef.current.slice(-24), makeHistorySnapshot()];
    redoStackRef.current = [];
  }, [makeHistorySnapshot]);
  const pushRedo = React.useCallback(() => {
    redoStackRef.current = [...redoStackRef.current.slice(-24), makeHistorySnapshot()];
  }, [makeHistorySnapshot]);
  const restoreHistorySnapshot = React.useCallback((snapshot) => {
    actions.restoreTodosSnapshot(snapshot);
    setSel(snapshot.selId || null);
  }, [actions]);

  const onAdd = (text) => {
    if (!text?.trim()) return;
    pushUndo();
    // '전체' 모드에서 추가 — 오늘에 붙임 (마감 없음)
    const id = (filterMode === "all" || isToday)
      ? actions.addTodo(text)
      : actions.addTodo(text, { dueDate: selectedDate });
    if (id) setSel(id);
  };

  const dateLabel = isToday ? L("todo.today") : (window.i18n && window.i18n.fmtDate ? window.i18n.fmtDate(selectedDate) : selectedDate);
  const dateLabelShort = isToday ? L("todo.today") : fmtMD(selectedDate);
  const placeholder = filterMode === "all"
    ? L("todo.addPh")
    : (isToday ? L("todo.addPh") : `${fmtMD(selectedDate)} ${L("todo.addPhDate")}`);

  const monthLabel = fmtMonthLabel(todayStr);

  // 헤더 — 두 칸 세그먼트 토글 ([날짜] [N월])
  const headerToggle = (
    <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", gap: 4, minWidth: 0 }}>
        <SegPill
          active={filterMode === "date"}
          onClick={() => { setFilterMode("date"); setSelectedDate(todayStr); }}
          icon="📅"
          label={dateLabelShort}
          count={dateModeIncomplete}
        />
        <SegPill
          active={filterMode === "all"}
          onClick={() => setFilterMode("all")}
          icon="📋"
          label={monthLabel}
          count={allModeIncomplete}
        />
      </div>
      {showPomodoro && <PomodoroBarButton inline />}
    </div>
  );

  // 진행도 — 보이는 할 일 + 그들의 서브태스크 체크박스 전체 카운팅
  const progressTotal = list.reduce((s, t) => s + 1 + (t.subTasks?.length ?? 0), 0);
  const progressDone = list.reduce((s, t) => s + (t.done ? 1 : 0) + (t.subTasks?.filter(st => st.done).length ?? 0), 0);

  useEffect(() => {
    const selectedTodo = () => {
      if (!selId) return null;
      const s = diary.getState();
      return (s.todos || []).find(t => t.id === selId) || null;
    };
    const addOpts = () => (filterMode === "all" || selectedDate === diary.today())
      ? {}
      : { dueDate: selectedDate };
    const copyTodo = async (todo) => {
      copiedTodoRef.current = clonePlain(todo);
      await writeClipboardText(todoClipboardText(todo));
    };
    const onKeyDown = async (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextEditingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if ((key === "c" || key === "x") && String(window.getSelection?.() || "").trim()) return;
      if (key === "z" && !e.shiftKey) {
        const prev = undoStackRef.current.pop();
        if (!prev) return;
        e.preventDefault();
        pushRedo();
        restoreHistorySnapshot(prev);
        return;
      }

      if (key === "y" || (key === "z" && e.shiftKey) || (key === "x" && redoStackRef.current.length > 0)) {
        const next = redoStackRef.current.pop();
        if (!next) return;
        e.preventDefault();
        undoStackRef.current = [...undoStackRef.current.slice(-24), makeHistorySnapshot()];
        restoreHistorySnapshot(next);
        return;
      }

      if (key === "c") {
        const todo = selectedTodo();
        if (!todo) return;
        e.preventDefault();
        await copyTodo(todo);
        return;
      }

      if (key === "x") {
        const todo = selectedTodo();
        if (!todo) return;
        e.preventDefault();
        await copyTodo(todo);
        pushUndo();
        actions.removeTodo(todo.id);
        setSel(null);
        return;
      }

      if (key === "v") {
        e.preventDefault();
        const text = await readClipboardText();
        const copied = copiedTodoRef.current;
        const copiedText = copied ? todoClipboardText(copied).trim() : "";
        if (copied && (!text.trim() || text.trim() === copiedText)) {
          pushUndo();
          const id = actions.addTodoFromSnapshot(copied);
          if (id) setSel(id);
          return;
        }
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (!lines.length) return;
        pushUndo();
        let lastId = null;
        lines.forEach(line => { lastId = actions.addTodo(line, addOpts()) || lastId; });
        if (lastId) setSel(lastId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, filterMode, makeHistorySnapshot, pushRedo, pushUndo, restoreHistorySnapshot, selectedDate, selId]);

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
                ? L("todo.emptyMonth")
                : (isToday ? L("todo.emptyToday") : L("todo.emptyDate", { d: fmtMD(selectedDate) }))}
            </div>
          )}
        </div>
      }
      middle={progressTotal > 0 && <TodoProgressBar done={progressDone} total={progressTotal} />}
      bottomHeight={calHeight}
      onBottomHeightChange={onCalResize}
      bottomScroll={false}
      bottom={
        <TodoMonthCalendar
          dueDates={dueDates}
          doneDates={doneDates}
          selectedDate={filterMode === "date" ? selectedDate : null}
          onPick={(d) => { setSelectedDate(d); setFilterMode("date"); }}
          actions={actions}
          selId={selId}
          selectedTodo={selId ? items.find(t => t.id === selId) : null}
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

// ---- 진행도 바 — 투두리스트와 달력 사이 ----
// 보이는 모든 체크박스(상위 + 하위) 합산 비율.
function TodoProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "3px 12px",
      background: "rgba(255,255,255,0.55)",
      borderTop: "1px solid var(--ink-soft)",
    }}>
      <div style={{
        flex: 1, height: 5, borderRadius: 99,
        background: "rgba(0,0,0,0.1)", overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: complete
            ? "#52c759"
            : "linear-gradient(90deg, var(--point-soft, #ffe3a0), var(--point, #fdff85))",
          transition: "width 0.2s ease",
        }} />
      </div>
      <span style={{
        fontFamily: "var(--mono)", fontSize: 10,
        color: complete ? "#2f7d44" : "var(--ink-2)",
        flexShrink: 0, minWidth: 28, textAlign: "right",
      }}>{done}/{total}</span>
    </div>
  );
}

// ---- 컴팩트 월간 달력 (할 일 탭 아래) ----
// 추가 인터랙션:
// (1) 할 일이 선택된 상태에서 셀 위에 드래그 → 기간(startDate/endDate) 설정.
// (2) 할 일 행을 잡아서 셀에 드롭 → 그 날짜로 dueDate 이동 (기간 클리어).
function TodoMonthCalendar({ dueDates, doneDates, selectedDate, onPick, actions, selId, selectedTodo }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const todayStr = diary.today();

  // 범위 드래그 상태 — selId 있는 동안만 활성
  const [downDate, setDownDate] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  // HTML5 drop 호버 (시각 피드백용)
  const [dropDate, setDropDate] = useState(null);

  // mouseup 윈도우 핸들러 — 범위 드래그 종료
  useEffect(() => {
    if (!downDate) return;
    const onUp = () => {
      const draggedAcross = hoverDate && hoverDate !== downDate;
      if (draggedAcross && selId && actions) {
        const lo = downDate < hoverDate ? downDate : hoverDate;
        const hi = downDate < hoverDate ? hoverDate : downDate;
        actions.setTodoPeriod(selId, lo, hi);
        actions.setTodoDue(selId, null);
      } else {
        // 단순 클릭이거나 selId 없이 드래그한 경우 → 평소처럼 날짜 필터
        onPick(downDate);
      }
      setDownDate(null);
      setHoverDate(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [downDate, hoverDate, selId, actions, onPick]);

  // 셀이 현재 드래그 중인 범위 안에 있는지 — selId 있을 때만 시각화 (그래야 의미 있음)
  const inRangeDrag = (d) => {
    if (!selId || !downDate || !hoverDate) return false;
    const lo = downDate < hoverDate ? downDate : hoverDate;
    const hi = downDate < hoverDate ? hoverDate : downDate;
    return lo <= d && d <= hi;
  };

  // 선택된 할 일의 기존 기간 — 시각적으로 미리 깔아둠 (드래그 안 하는 평소에도)
  const selPeriod = selectedTodo ? normalizedPeriod(selectedTodo) : null;
  const inSelPeriod = (d) => !!selPeriod && selPeriod.start <= d && d <= selPeriod.end;

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
      {/* 날짜 그리드 — 셀 최소 높이 보장 + 부족하면 스크롤. 스크롤은 주 단위로 스냅. */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
        display: "grid",
        gridTemplateColumns: "repeat(7,1fr)",
        gridTemplateRows: `repeat(${rows}, minmax(30px, 1fr))`,
        scrollSnapType: "y mandatory",
        scrollPaddingTop: 0,
      }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} style={{ borderTop: "1px solid #eef0f3", borderLeft: i % 7 === 0 ? "none" : "1px solid #eef0f3", scrollSnapAlign: "start" }} />;
          const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDate;
          const hasDue = dueDates.has(ds);
          const hasDone = doneDates.has(ds);
          const isInRange = inRangeDrag(ds);
          const isInSelPeriod = !isInRange && inSelPeriod(ds);
          const isDropHover = dropDate === ds;

          // 배경 — 드롭 호버 > 드래그 범위 > 선택 셀 > 선택 할 일의 기간 표시
          let cellBg = "transparent";
          if (isDropHover) cellBg = "var(--hi)";
          else if (isInRange) cellBg = "var(--hi-soft)";
          else if (isSelected) cellBg = "var(--hi-soft)";
          else if (isInSelPeriod) cellBg = "rgba(168, 196, 232, 0.22)";

          return (
            <div
              key={i}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                setDownDate(ds);
                setHoverDate(ds);
              }}
              onMouseEnter={() => { if (downDate) setHoverDate(ds); }}
              onDragOver={(e) => {
                if (!actions) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dropDate !== ds) setDropDate(ds);
              }}
              onDragLeave={() => { if (dropDate === ds) setDropDate(null); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = e.dataTransfer.getData("text/todo-id");
                setDropDate(null);
                if (id && actions) actions.moveTodoToDate(id, ds);
              }}
              style={{
                cursor: "pointer", position: "relative",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                borderTop: "1px solid #eef0f3",
                borderLeft: i % 7 === 0 ? "none" : "1px solid #eef0f3",
                background: cellBg,
                boxShadow: isSelected && !isInRange && !isDropHover ? "inset 0 0 0 1.5px var(--ink)" : "none",
                userSelect: "none",
                scrollSnapAlign: "start",
              }}>
              <span style={{
                width: 20, height: 20, display: "grid", placeItems: "center", borderRadius: "50%",
                fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: isToday ? 700 : 400,
                background: isToday ? "var(--point)" : "transparent",
                color: "var(--ink)",
                pointerEvents: "none",
              }}>{d}</span>
              <span style={{ display: "inline-flex", gap: 2, height: 4, pointerEvents: "none" }}>
                {hasDue && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#e06a7a" }} />}
                {hasDone && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#9aa7b8" }} />}
              </span>
            </div>
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
// • subTasks: 접히는 하위 목록 + 진행도 (n/m) 뱃지
function TodoRow({ t, actions, recRule, i = 0, compact = false, selected = false, onPick }) {
  const [recOpen, setRecOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  // 서브태스크 — 항목이 있으면 기본 펼침, 없으면 접힘. 사용자가 토글하면 그 상태 유지.
  const [subOpen, setSubOpen] = useState(() => (t.subTasks?.length ?? 0) > 0);
  const [subInput, setSubInput] = useState("");
  // 호버 기반 액션 노출 — Notion 패턴 (셀렉트 없이 호버만으로 드래그 핸들/액션 보임).
  const [hover, setHover] = useState(false);
  // 제목 인라인 편집 — Things 3 패턴 (클릭하면 그 자리에서 input).
  const [editingTitle, setEditingTitle] = useState(false);
  // 외부에서 첫 서브태스크 추가됐을 때(드래그 nest 등) 자동 펼침
  const hadSubsRef = React.useRef((t.subTasks?.length ?? 0) > 0);
  React.useEffect(() => {
    const has = (t.subTasks?.length ?? 0) > 0;
    if (has && !hadSubsRef.current) setSubOpen(true);
    hadSubsRef.current = has;
  }, [t.subTasks?.length]);
  // 드롭 모드 — null | "before"(위로 이동) | "into"(하위로 넣기)
  const [dropMode, setDropMode] = useState(null);
  // 호버 또는 선택 상태면 액션 아이콘 노출. 드래그는 done 아닌 비-compact 행이면 언제든 가능.
  const showActions = !compact && (hover || selected);
  const showDrag = !compact && !t.done;
  const showHandle = !compact && hover && !t.done;

  const subs = t.subTasks || [];
  const subDone = subs.filter(s => s.done).length;
  const hasSubs = subs.length > 0;

  const stop = (e) => e.stopPropagation();
  const onRowClick = (e) => { e.stopPropagation(); if (onPick) onPick(t.id); };

  const onDragStart = (e) => { e.dataTransfer.setData("text/todo-id", t.id); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (compact) return;
    // 위쪽 32% = 위로 이동(reorder), 그 외 = 하위로 넣기(nest)
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
    const mode = ratio < 0.32 ? "before" : "into";
    if (dropMode !== mode) setDropMode(mode);
  };
  const onDragLeave = (e) => {
    // 자식 진입으로 인한 false leave 방지 — geometry 로 실제 row 밖인지 확인
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setDropMode(null);
    }
  };
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    const fromId = e.dataTransfer.getData("text/todo-id");
    const mode = dropMode;
    setDropMode(null);
    if (!fromId || fromId === t.id) return;
    if (mode === "into") {
      actions.nestAsSubTask(t.id, fromId);
    } else {
      actions.reorderTodoBefore(fromId, t.id);
    }
  };

  const addSub = () => {
    const v = subInput.trim();
    if (!v) return;
    actions.addSubTask(t.id, v);
    setSubInput("");
  };

  const openTodoMemo = (e) => {
    stop(e);
    const memoId = actions.ensureTodoMemo ? actions.ensureTodoMemo(t.id) : null;
    if (!memoId) return;
    window.todoaryPendingMemoId = memoId;
    window.dispatchEvent(new CustomEvent("todoary-open-memo", { detail: { memoId, todoId: t.id } }));
  };

  return (
    <div
      onClick={onRowClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={showDrag}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      className="tape"
      style={{
        ...lightTape(i, t.pinned),
        padding: compact ? "5px 14px" : "6px 10px 6px 4px",
        marginBottom: compact ? 5 : 6,
        outline: dropMode === "into" ? "2px solid var(--point)" : "none",
        outlineOffset: 1,
        // Things 3 식 — 선택 시 살짝 두꺼운 왼쪽 액센트 (큰 외곽선 대신)
        boxShadow: dropMode === "before"
          ? "inset 0 3px 0 var(--ink)"
          : (selected ? "inset 3px 0 0 var(--ink)" : undefined),
        opacity: t.done ? 0.7 : 1,
        cursor: "default",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* 드래그 핸들 — Notion 패턴: 호버 시에만 왼쪽 가장자리에 ⋮⋮ */}
        <span
          title={showHandle ? L("todo.dragMove") : ""}
          style={{
            flexShrink: 0, width: 12,
            cursor: showHandle ? "grab" : "default",
            color: "var(--ink-3)", fontSize: 12, lineHeight: 1,
            userSelect: "none", textAlign: "center",
            opacity: showHandle ? 0.5 : 0,
            transition: "opacity 0.12s",
          }}
        >{showHandle ? "⋮⋮" : ""}</span>
        <button
          onClick={(e) => { stop(e); actions.toggleTodo(t.id); }}
          className={"sk-check" + (t.done ? " done" : "")}
          style={{ cursor: "pointer", flexShrink: 0 }}
          title={t.done ? L("todo.undoDone") : L("todo.markDone")}
        />
        {/* 서브태스크 접힘 토글 — 항목 있거나 호버/선택일 때 노출 */}
        {(hasSubs || hover || selected) && !compact && (
          <button
            onClick={(e) => { stop(e); setSubOpen(o => !o); }}
            title={subOpen ? L("todo.subCollapse") : L("todo.subExpand")}
            style={{
              all: "unset", cursor: "pointer", flexShrink: 0,
              width: 14, height: 14, display: "grid", placeItems: "center",
              fontSize: 10, color: hasSubs ? "var(--ink-2)" : "var(--ink-3)", lineHeight: 1,
              transform: subOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
              opacity: hasSubs ? 1 : 0.55,
            }}
          >▸</button>
        )}
        {/* 제목 — 클릭하면 인라인 편집 (Things 3 패턴) */}
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={t.title}
            onClick={stop}
            onMouseDown={stop}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== t.title) actions.updateTodo(t.id, { title: v });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
              else if (e.key === "Escape") {
                e.preventDefault();
                e.target.value = t.title;
                setEditingTitle(false);
              }
            }}
            style={{
              flex: 1, minWidth: 0,
              border: 0, outline: "none", background: "rgba(255,255,255,0.55)",
              borderRadius: 4, padding: "1px 4px",
              fontFamily: "var(--hand)", fontSize: compact ? 14 : 15,
              color: "var(--ink)",
            }}
          />
        ) : (
          <span
            onClick={(e) => { stop(e); if (!t.done) setEditingTitle(true); }}
            title={L("todo.editTitle")}
            style={{
              flex: 1, minWidth: 0, fontFamily: "var(--hand)",
              fontSize: compact ? 14 : 15,
              color: t.done ? "var(--ink-3)" : "var(--ink)",
              textDecoration: t.done ? "line-through" : "none",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              cursor: t.done ? "default" : "text",
              padding: "1px 2px",
            }}
          >{t.title}</span>
        )}

        {/* 마감 뱃지 */}
        {t.dueDate && (
          <span title={`${L("todo.due")} ${t.dueDate}`} style={dueBadge}>{fmtMD(t.dueDate)}</span>
        )}
        {/* 반복 표시 */}
        {recRule && <span title={`${L("todo.repeat")} — ${recLabel(recRule)}`} style={{ fontSize: 12, color: "var(--ink-2)" }}>↻</span>}

        {(showActions || t.memoId) && !compact && (
          <button
            onClick={openTodoMemo}
            title={L("todo.openMemo")}
            style={{ ...iconBtn, color: t.memoId ? "var(--ink)" : "var(--ink-3)" }}
          >📝</button>
        )}

        {/* 호버/선택 시 액션 아이콘 */}
        {showActions && (
          <>
            <button onClick={(e) => { stop(e); actions.togglePin(t.id); }} title={t.pinned ? L("todo.unpin") : L("todo.pin")}
              style={{ ...iconBtn, color: t.pinned ? "#7a5a10" : "var(--ink-3)", fontWeight: t.pinned ? 800 : 400 }}>!</button>
            <button onClick={(e) => { stop(e); setDueOpen(o => !o); }} title={L("todo.dueDate")} style={iconBtn}>📅</button>
            <button onClick={(e) => { stop(e); setRecOpen(o => !o); }} title={L("todo.repeat")} style={{ ...iconBtn, color: recRule ? "var(--ink)" : "var(--ink-3)" }}>↻</button>
            <DelBtn onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); actions.removeTodo(t.id); }} />
          </>
        )}
      </div>

      {/* 서브태스크 펼침 — Notion 식 들여쓰기, 박스 없음 */}
      {subOpen && !compact && (
        <div style={{
          marginTop: 4,
          paddingLeft: 22,  // 체크박스 + 핸들 위치 정도로 들여쓰기
          display: "flex", flexDirection: "column", gap: 1,
        }} onClick={stop}>
          {subs.map(st => (
            <SubTaskRow key={st.id} st={st} parentId={t.id} actions={actions} />
          ))}
          {/* 새 항목 입력 — 버튼 토글 없이 항상 보임. 클릭해서 바로 타이핑, Enter 로 추가하고 연속 입력. */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 0" }}>
            <span
              aria-hidden="true"
              style={{
                width: 14, flexShrink: 0,
                color: "var(--ink-3)", fontSize: 11, textAlign: "center",
                opacity: subInput ? 0.7 : 0.35,
                transition: "opacity 0.12s",
              }}
            >+</span>
            <input
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addSub(); }
                else if (e.key === "Escape") {
                  e.preventDefault();
                  setSubInput("");
                  e.target.blur();
                }
              }}
              placeholder={L("todo.subAdd")}
              style={{
                flex: 1, minWidth: 0,
                border: 0, outline: "none", background: "transparent",
                fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
                padding: "1px 2px",
              }}
            />
          </div>
        </div>
      )}

      {/* 마감일 펼침 */}
      {dueOpen && showActions && (
        <div style={expanderRow} onClick={stop}>
          <span style={miniLabel}>{L("todo.due")}</span>
          <input type="date" value={t.dueDate || ""} onChange={(e) => actions.setTodoDue(t.id, e.target.value)} style={dateInput} />
          {t.dueDate && <button onClick={(e) => { stop(e); actions.setTodoDue(t.id, null); setDueOpen(false); }} style={miniBtn}>{L("todo.clear")}</button>}
          <span style={miniLabel}>{L("todo.period")}</span>
          <input type="date" value={t.startDate || ""} onChange={(e) => actions.setTodoPeriod(t.id, e.target.value, t.endDate || e.target.value)} style={dateInput} />
          <span style={miniLabel}>~</span>
          <input type="date" value={t.endDate || ""} onChange={(e) => actions.setTodoPeriod(t.id, t.startDate || e.target.value, e.target.value)} style={dateInput} />
          {(t.startDate || t.endDate) && <button onClick={(e) => { stop(e); actions.setTodoPeriod(t.id, null, null); }} style={miniBtn}>{L("todo.clearPeriod")}</button>}
          <button onClick={(e) => { stop(e); setDueOpen(false); }} style={miniBtn}>{L("todo.close")}</button>
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

// 서브태스크 한 줄 — 호버 시 × 노출, 제목 클릭하면 인라인 편집
function SubTaskRow({ st, parentId, actions }) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const linkUrl = (st.linkUrl || "").trim();
  const editLink = async (e) => {
    e.stopPropagation();
    const msg = L("todo.subLinkPrompt");
    const next = window.dialog && window.dialog.prompt
      ? await window.dialog.prompt(msg, linkUrl)
      : prompt(msg, linkUrl);
    if (next == null) return;
    actions.setSubTaskLink(parentId, st.id, next.trim());
  };
  const openLink = (e) => {
    e.stopPropagation();
    if (linkUrl) openExternalUrl(linkUrl);
  };
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "1px 0",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); actions.toggleSubTask(parentId, st.id); }}
        className={"sk-check" + (st.done ? " done" : "")}
        style={{ cursor: "pointer", flexShrink: 0, transform: "scale(0.82)" }}
        title={st.done ? L("todo.undoDone") : L("todo.markDone")}
      />
      {editing ? (
        <input
          autoFocus
          defaultValue={st.title}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== st.title) actions.renameSubTask(parentId, st.id, v);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
            else if (e.key === "Escape") {
              e.preventDefault();
              e.target.value = st.title;
              setEditing(false);
            }
          }}
          style={{
            flex: 1, minWidth: 0,
            border: 0, outline: "none",
            background: "rgba(255,255,255,0.55)", borderRadius: 4,
            padding: "1px 4px",
            fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
          }}
        />
      ) : (
        <span
          onClick={(e) => { e.stopPropagation(); if (!st.done) setEditing(true); }}
          style={{
            flex: 1, minWidth: 0, fontFamily: "var(--hand)", fontSize: 13,
            color: st.done ? "var(--ink-3)" : "var(--ink)",
            textDecoration: st.done ? "line-through" : "none",
            wordBreak: "break-word",
            cursor: st.done ? "default" : "text",
            padding: "1px 2px",
          }}
        >{st.title}</span>
      )}
      {linkUrl && (
        <button
          onClick={openLink}
          title={`${L("todo.subLinkOpen")}: ${linkUrl}`}
          style={{ ...subIconBtn, opacity: 0.78 }}
        >↗</button>
      )}
      {hover && (
        <button
          onClick={editLink}
          title={linkUrl ? L("todo.subLinkEdit") : L("todo.subLinkAdd")}
          style={{ ...subIconBtn, opacity: 0.68 }}
        >🔗</button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); actions.removeSubTask(parentId, st.id); }}
        title={L("memo.delete")}
        style={{
          all: "unset", cursor: "pointer", flexShrink: 0,
          width: 14, height: 14, display: "grid", placeItems: "center",
          fontSize: 11, color: "var(--ink-3)", borderRadius: 3,
          opacity: hover ? 0.6 : 0,
          transition: "opacity 0.12s",
        }}
      >×</button>
    </div>
  );
}

function RecurrencePanel({ t, recRule, actions, onClose }) {
  const [freq, setFreq] = useState(recRule?.frequency || "daily");
  const initialDays = Array.isArray(recRule?.weeklyDays) && recRule.weeklyDays.length
    ? recRule.weeklyDays.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
    : [1, 3, 5];
  const [days, setDays] = useState(initialDays);
  const DOW = (window.i18n && window.i18n.weekdays) ? window.i18n.weekdays() : ["일", "월", "화", "수", "목", "금", "토"];
  const toggleDay = (d) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  const apply = () => {
    const weeklyDays = days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
    if (freq === "weekly" && weeklyDays.length === 0) return;
    const patch = { title: t.title, frequency: freq, weeklyDays: freq === "weekly" ? weeklyDays : [] };
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
        {[["daily", L("todo.recDaily")], ["weekdays", L("todo.recWeekdays")], ["weekly", L("todo.recWeekly")]].map(([v, lbl]) => (
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
        <button
          onClick={apply}
          disabled={freq === "weekly" && days.length === 0}
          style={{
            ...miniBtn,
            background: "var(--point)",
            opacity: freq === "weekly" && days.length === 0 ? 0.45 : 1,
            cursor: freq === "weekly" && days.length === 0 ? "not-allowed" : "pointer",
          }}
        >{L("todo.apply")}</button>
        {recRule && <button onClick={remove} style={{ ...miniBtn, color: "var(--bad)" }}>{L("todo.removeRepeat")}</button>}
        <button onClick={onClose} style={miniBtn}>{L("todo.close")}</button>
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
  display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap",
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
const miniLabel = {
  fontFamily: "var(--hand)", fontSize: 11, fontWeight: 700, color: "var(--ink-2)",
};
const dateInput = {
  border: "1px solid var(--ink-soft)", borderRadius: 6, padding: "2px 6px",
  fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", background: "var(--paper)",
};
const subIconBtn = {
  all: "unset", cursor: "pointer", flexShrink: 0,
  width: 16, height: 16, display: "grid", placeItems: "center",
  fontSize: 11, lineHeight: 1, color: "var(--ink-2)", borderRadius: 3,
  transition: "opacity 0.12s, background 0.12s",
};

window.TodoView = TodoView;
