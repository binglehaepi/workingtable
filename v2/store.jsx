/* global React */
// ===========================================================
// todoary — 데이터 레이어
// localStorage 한 키에 전체 상태를 JSON으로 저장.
// useDiary() 훅 하나로 모든 컴포넌트가 동일한 상태를 공유.
// Electron/Tauri로 래핑해도 그대로 동작 (저장 경로만 바꾸면 됨).
// ===========================================================

const STORAGE_KEY = "todoary.v1";

// ---- 마이그레이션 진단 스냅샷 (첫 실행 1회만) ----
// 데이터 손실 신고 시 F12 콘솔에서 localStorage.getItem("todoary.migration.diag")
// 한 줄이면 "처음 켰을 때 무엇이 있었는지" 가 나옴. 사후 진단 용도.
try {
  const DIAG_KEY = "todoary.migration.diag";
  if (typeof localStorage !== "undefined" && !localStorage.getItem(DIAG_KEY)) {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith("vibe-diary") || k.startsWith("todoary")
    );
    const snapshot = {
      ts: new Date().toISOString(),
      keys,
      hadTodoaryV1: !!localStorage.getItem("todoary.v1"),
      hadLegacyV1: !!localStorage.getItem("vibe-diary.v1"),
      hadTodoaryLang: !!localStorage.getItem("todoary.lang"),
      hadLegacyLang: !!localStorage.getItem("vibe-diary.lang"),
      hadTodoaryTweaks: !!localStorage.getItem("todoary.tweaks"),
      hadLegacyTweaks: !!localStorage.getItem("vibe-diary.tweaks"),
      ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "",
    };
    localStorage.setItem(DIAG_KEY, JSON.stringify(snapshot));
  }
} catch (_) {}

// 앱 이름 변경(vibe-diary → todoary) 전 데이터를 한 번만 이관.
// 플래그 기반: vibe-diary.v1 가 있고 아직 이관 안 했으면 → 이관 (기존 todoary.v1 은 backup).
// 한 번 이관 후엔 플래그가 set 돼 다시는 자동 이관 안 함 — 의도치 않은 덮어쓰기 방지.
try {
  const LEGACY = "vibe-diary.v1";
  const MIGRATED_FLAG = "todoary.migrated_from_vibe.v1";
  if (typeof localStorage !== "undefined"
      && localStorage.getItem(LEGACY)
      && !localStorage.getItem(MIGRATED_FLAG)) {
    // 기존 todoary.v1 가 있으면 백업 (시각 도장 키로 보존)
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      try {
        const backupKey = "todoary.v1.backup." + Date.now();
        localStorage.setItem(backupKey, existing);
      } catch (_) {}
    }
    // 이관
    localStorage.setItem(STORAGE_KEY, localStorage.getItem(LEGACY));
    localStorage.removeItem(LEGACY);
    // 한 번 이관 했음을 마크 (이후 vibe-diary.v1 다시 생겨도 다시 안 함)
    localStorage.setItem(MIGRATED_FLAG, new Date().toISOString());
  }
} catch (_) { /* private mode / no storage */ }

// ---- 유틸 ----
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
/** 완료 시각 — 로컬 시계 기준(타임존 Z 없음, 달력일 밀림 방지) */
function completedAtNow() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${dd}T${hh}:${mm}:${ss}`;
}
/** ISO/타임스탬프 → 로컬 달력일 YYYY-MM-DD (today()와 동일 기준) */
function localDayFromIso(iso) {
  if (!iso) return null;
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasTz ? s : s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) {
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function normalizeWeeklyDays(days) {
  const seen = new Set();
  return (Array.isArray(days) ? days : [])
    .map(Number)
    .filter(d => Number.isInteger(d) && d >= 0 && d <= 6 && !seen.has(d) && (seen.add(d), true))
    .sort((a, b) => a - b);
}
function normalizeFrequency(frequency) {
  return ["daily", "weekdays", "weekly"].includes(frequency) ? frequency : "daily";
}
const fmtKDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = ["일","월","화","수","목","금","토"][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${dow})`;
};
const fmtKDateShort = (iso) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
};
function memoEscapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function memoBodyToHtml(body) {
  return (body || "").split(/\r?\n/).map(line => `<div>${memoEscapeHtml(line) || "<br>"}</div>`).join("");
}
function memoMessagesToHtml(messages) {
  return (messages || []).map(m => {
    if (m.type === "text") {
      const style = [];
      if (m.color && m.color !== "#222222" && m.color !== "#222") style.push(`color:${m.color}`);
      if (m.fontSize === "small") style.push("font-size:12px");
      else if (m.fontSize === "large") style.push("font-size:18px");
      if (m.fontFamily === "mono") style.push("font-family:var(--mono),monospace");
      else if (m.fontFamily === "serif") style.push("font-family:Georgia,serif");
      const text = memoEscapeHtml(m.text || "").replace(/\n/g, "<br>");
      return style.length
        ? `<div><span style="${style.join(";")}">${text || "<br>"}</span></div>`
        : `<div>${text || "<br>"}</div>`;
    }
    if (m.type === "image") return `<div><img src="${m.imageUrl}" style="max-width:100%;"/></div>`;
    if (m.type === "link") return `<div><a href="${memoEscapeHtml(m.linkUrl)}">${memoEscapeHtml(m.linkLabel || m.linkUrl)}</a></div>`;
    return "";
  }).join("");
}
function memoTitleFromHtml(html) {
  if (!html) return "";
  // 태그 제거 → textContent 추출
  let text = "";
  try {
    if (typeof document !== "undefined") {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      text = tmp.textContent || "";
    } else {
      text = String(html).replace(/<[^>]+>/g, " ");
    }
  } catch (_) {
    text = String(html).replace(/<[^>]+>/g, " ");
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t) return t.slice(0, 60);
  }
  if (/<img/i.test(html)) return "🖼 이미지";
  if (/<a /i.test(html)) return "🔗 링크";
  return "";
}
function todoMemoHtml(todo) {
  const todoId = memoEscapeHtml(todo?.id || "");
  const checked = todo?.done ? ' checked="checked"' : "";
  return `<div data-linked-todo="${todoId}"><input type="checkbox" data-linked-todo-check="${todoId}"${checked} /> <strong>${memoEscapeHtml(todo?.title || "")}</strong></div>${todoSubTaskMemoHtml(todo)}<div><br></div>`;
}
function todoSubTaskMemoHtml(todo, existingHtml = "") {
  const todoId = memoEscapeHtml(todo?.id || "");
  return (todo?.subTasks || []).filter(st => {
    const subId = memoEscapeHtml(st.id || "");
    return subId && !existingHtml.includes(`data-linked-subtask-check="${subId}"`);
  }).map(st => {
    const subId = memoEscapeHtml(st.id || "");
    const subChecked = st.done ? ' checked="checked"' : "";
    return `<div data-linked-subtask="${subId}" style="margin-left:22px"><input type="checkbox" data-linked-subtask-check="${subId}" data-linked-subtask-parent="${todoId}"${subChecked} /> <span>${memoEscapeHtml(st.title || "")}</span></div>`;
  }).join("");
}
// 메모 아이콘 — 도트 스프라이트 인덱스 (Sprite-0002.png, 6x4=24).
// 문자열이 아니라 숫자(0..23). 표시는 <SpriteIcon idx={...} /> 로.
const MEMO_ICONS = Array.from({ length: 24 }, (_, i) => i);
const randomMemoIcon = () => MEMO_ICONS[Math.floor(Math.random() * MEMO_ICONS.length)];

// ---- 초기 시드 ----
// 첫 실행 시엔 예시 데이터 없이 빈 상태로 시작한다.
// (사용 가능하도록 빈 시작 프로젝트 하나만 둠)
function seed() {
  const pid1 = uid();
  const t = today();
  return {
    schemaVersion: 1,
    currentProjectId: pid1,
    projects: [
      {
        id: pid1,
        name: "내 프로젝트",
        path: "",
        stack: [],
        links: [],
        gitBranch: "main",
        repoUrl: "",
        version: "0.1.0",
        nextVersion: "",
        cheatsheet: "",
        status: "active",
        createdAt: t,
      },
    ],
    todos: [],
    recurrences: [],
    lastGenDate: t,
    prompts: [],
    emails: [],
    aiBookmarks: [],
    commands: [],
    retros: [],
    playlist: [],
    dday: { date: "", label: "디데이" },
    mailUrl: "",
    notes: {},
    weekNotes: {},
    replyPresets: [],
    memos: [],
    selectedDate: t,
    stuck: {},
    timer: {
      workMin: 25,
      breakMin: 5,
      lengthMin: 25,   // 현재 사이클 분 (집중/휴식)
      phase: "idle",   // idle | work | break
      enabled: true,
      cycleStartedAt: null,
      paused: false,
      pausedRemainingMs: null,
      notificationsGranted: false,
      lastNotifiedAt: null,
      pomodoroCount: 0,
      soundEnabled: true,
      soundVolume: 70,
      soundType: "chime",
    },
    workSessions: [],
    songPlays: {},
  };
}

// ---- 저장 / 불러오기 ----
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const data = JSON.parse(raw);
    if (!data || data.schemaVersion !== 1) return seed();
    // ---- 마이그레이션 (필드 추가에 안전) ----
    data.commands    ??= [];
    data.todos       ??= [];
    data.recurrences ??= [];
    data.recurrences = data.recurrences.map(r => {
      const frequency = normalizeFrequency(r.frequency);
      return {
        ...r,
        frequency,
        weeklyDays: frequency === "weekly" ? normalizeWeeklyDays(r.weeklyDays) : [],
        active: r.active !== false,
      };
    });
    data.lastGenDate ??= today();
    data.prompts     ??= [];
    data.emails      ??= [];
    data.aiBookmarks ??= [];
    data.retros      ??= [];
    // mood 필드 보강 (기존 회고 데이터 보존)
    data.retros = data.retros.map(r => ({ mood: null, ...r }));
    data.playlist    ??= [];
    data.dday        ??= { date: "", label: "디데이" };
    data.mailUrl     ??= "";
    data.notes       ??= {};
    data.weekNotes   ??= {};
    data.replyPresets ??= [];
    data.memos       ??= [];
    // 기존 메모를 단일 html 본문으로 통합. body → html, messages → html.
    data.memos = data.memos.map(m => {
      // icon: 숫자 인덱스(0..23). 기존 문자열 이모지는 마이그레이션 시 랜덤 도트로 교체.
      const next = { ...m, icon: (typeof m.icon === "number" ? m.icon : randomMemoIcon()) };
      if (typeof next.html !== "string") next.html = "";
      if (!next.html && Array.isArray(next.messages) && next.messages.length > 0) {
        next.html = memoMessagesToHtml(next.messages);
      }
      if (!next.html && (next.body || "").trim()) {
        next.html = memoBodyToHtml(next.body);
      }
      // body는 비워둠 (messages는 보존 — 데이터 보안용으로 일단 남김)
      next.body = "";
      const inferredTitle = memoTitleFromHtml(next.html);
      if (!next.title) next.title = inferredTitle;
      next.manualTitle = next.manualTitle ?? (!!String(next.title || "").trim() && next.title !== inferredTitle);
      next.todoId = next.todoId ?? null;
      return next;
    });
    data.selectedDate = today();   // 시작 시 항상 오늘
    data.stuck       ??= {};
    // 메일에 body/draft/platformUrl 보강
    data.emails = (data.emails ?? []).map(e => ({ body: "", draft: "", platformUrl: "", ...e }));
    // 할 일 스키마 마이그레이션 (text→title, hot→pinned, doneTs→completedAt 등)
    data.todos = (data.todos ?? []).map((t, i) => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title ?? t.text ?? "",
      pinned: t.pinned ?? !!t.hot ?? false,
      pinnedAt: t.pinnedAt ?? null,
      dueDate: t.dueDate ?? null,
      startDate: t.startDate ?? null,
      endDate: t.endDate ?? null,
      order: t.order ?? i,
      done: !!t.done,
      completedAt: t.completedAt ?? (t.doneTs ? new Date(t.doneTs).toISOString() : (t.doneAt ? t.doneAt + "T12:00:00" : null)),
      completedDay: t.completedDay ?? (t.done
        ? (localDayFromIso(t.completedAt) || (t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(t.dueDate)) ? t.dueDate : null) || localDayFromIso(t.createdAt))
        : null),
      recurrenceId: t.recurrenceId ?? null,
      memoId: t.memoId ?? null,
      trackedSeconds: t.trackedSeconds ?? 0,
      // 서브태스크 — 접히는 하위 목록. 각 항목은 { id, title, done, completedAt, linkUrl }
      subTasks: Array.isArray(t.subTasks) ? t.subTasks.map(st => ({
        id: st.id || uid(),
        title: String(st.title || "").trim(),
        done: !!st.done,
        completedAt: st.completedAt || null,
        linkUrl: String(st.linkUrl || st.url || "").trim(),
      })) : [],
      createdAt: t.createdAt ?? today(),
      // 작업방 공개 여부 — 기본 false (비공개). 사용자가 켠 항목만 방 멤버에게 제목 노출.
      roomVisible: !!t.roomVisible,
    }));
    data.timer ??= {
      workMin: 25, breakMin: 5, lengthMin: 25, phase: "idle",
      enabled: true, cycleStartedAt: null, paused: false, pausedRemainingMs: null,
      notificationsGranted: false, lastNotifiedAt: null, pomodoroCount: 0,
      soundEnabled: true, soundVolume: 70, soundType: "chime",
    };
    data.timer.workMin ??= 25;
    data.timer.breakMin ??= 5;
    data.timer.phase ??= (data.timer.cycleStartedAt ? "work" : "idle");
    data.timer.pomodoroCount ??= 0;
    data.timer.soundEnabled ??= true;
    data.timer.soundVolume ??= 70;
    data.timer.soundType ??= "chime";
    if (data.timer.lengthMin == null) data.timer.lengthMin = data.timer.workMin;
    data.workSessions ??= [];
    // workSessions 레거시 마이그레이션 — projectId 없던 시절 기록은 null(미분류)로 표기.
    data.workSessions = data.workSessions.map(w => ({
      lastTs: null,
      ...w,
      projectId: w.projectId !== undefined ? w.projectId : null,
      minutes: w.minutes ?? 0,
    }));
    data.songPlays   ??= {};
    // 프로젝트에 버전/저장소 필드 보강 (기존 값 우선)
    data.projects = (data.projects ?? []).map(p => ({
      repoUrl: "", version: "0.1.0", nextVersion: "", ...p,
    }));
    return data;
  } catch (e) {
    console.warn("diary: load failed, reseeding", e);
    return seed();
  }
}
function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("diary: save failed", e);
  }
}

// ---- 글로벌 상태 (간단한 pub/sub) ----
let _state = load();
const _subs = new Set();
function setState(updater) {
  const next = typeof updater === "function" ? updater(_state) : updater;
  _state = next;
  save(_state);
  _subs.forEach(fn => fn(_state));
}
function getState() { return _state; }
function subscribe(fn) { _subs.add(fn); return () => _subs.delete(fn); }

function normalizedTodoPeriod(t) {
  const a = t.startDate || null;
  const b = t.endDate || null;
  if (!a && !b) return null;
  const start = a || b;
  const end = b || a;
  return start <= end ? { start, end } : { start: end, end: start };
}
function completionDay(t) {
  if (!t.done) return null;
  if (t.completedDay && /^\d{4}-\d{2}-\d{2}$/.test(t.completedDay)) return t.completedDay;
  if (t.completedAt) {
    const fromCompleted = localDayFromIso(t.completedAt);
    if (fromCompleted) return fromCompleted;
  }
  const fromCreated = localDayFromIso(t.createdAt)
    || (String(t.createdAt || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || null);
  return fromCreated || today();
}

/** 작업한 날(YYYY-MM-DD) 집합 — 트래커 분·완료한 할 일 기준, 프로젝트 무관 */
function workDaysSet(s) {
  const days = new Set();
  (s.workSessions ?? []).forEach((w) => {
    if ((w.minutes || 0) > 0 && w.date) days.add(w.date);
  });
  (s.todos ?? []).forEach((todo) => {
    if (!todo.done) return;
    const d = completionDay(todo);
    if (d) days.add(d);
  });
  return days;
}

/** 오늘(또는 오늘 기록 없으면 어제)부터 거꾸로 이어진 작업일 수 */
function computeWorkStreak(s) {
  const days = workDaysSet(s);
  let cur = new Date();
  cur.setHours(0, 0, 0, 0);
  const iso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  if (!days.has(iso(cur))) {
    cur.setDate(cur.getDate() - 1);
    cur.setHours(0, 0, 0, 0);
  }
  let n = 0;
  while (days.has(iso(cur))) {
    n++;
    cur.setDate(cur.getDate() - 1);
    cur.setHours(0, 0, 0, 0);
  }
  return n;
}

function applyTodoDoneState(t, nextDone, completionDayOpt) {
  const day = completionDayOpt || today();
  const nextSubs = (t.subTasks || []).map((st) => ({
    ...st,
    done: nextDone,
    completedAt: nextDone ? (st.completedAt || completedAtNow()) : null,
  }));
  return {
    ...t,
    done: nextDone,
    completedAt: nextDone ? (t.completedAt || completedAtNow()) : null,
    completedDay: nextDone ? day : null,
    subTasks: nextSubs,
  };
}
function dayOfWeek(iso) {
  const [yy, mm, dd] = iso.split("-").map(Number);
  return new Date(yy, mm - 1, dd).getDay();
}
function dayMatchesRecurrence(day, recRule) {
  if (!recRule) return true;
  const dow = dayOfWeek(day);
  if (recRule.frequency === "daily") return true;
  if (recRule.frequency === "weekdays") return dow >= 1 && dow <= 5;
  if (recRule.frequency === "weekly") return (recRule.weeklyDays || []).includes(dow);
  return false;
}
function recurrenceRuleForTodo(t, recurrences) {
  if (!t?.recurrenceId) return null;
  return (recurrences ?? []).find(r => r.id === t.recurrenceId) || null;
}
function hasRecurrenceCompletionForDay(recurrenceId, day, todos, excludeId) {
  return (todos ?? []).some((td) => td.recurrenceId === recurrenceId
    && td.id !== excludeId
    && td.done
    && completionDay(td) === day
    && !normalizedTodoPeriod(td));
}
function findRecurrenceTemplate(s, recId) {
  return (s.todos ?? []).find((td) => td.recurrenceId === recId && normalizedTodoPeriod(td));
}
function mapInstanceSubToTemplateSub(instance, template, subId) {
  const instSub = (instance.subTasks || []).find((st) => st.id === subId);
  if (!instSub) return null;
  const templateSubs = template.subTasks || [];
  return templateSubs.find((st) => st.title === instSub.title)
    || templateSubs[(instance.subTasks || []).findIndex((st) => st.id === subId)]
    || null;
}
function resolveSubTaskToggleTarget(s, todoId, subId) {
  const hit = s.todos.find((x) => x.id === todoId);
  if (!hit) return null;
  if (!hit.recurrenceId || normalizedTodoPeriod(hit)) {
    return { todo: hit, todoId, subId };
  }
  const template = findRecurrenceTemplate(s, hit.recurrenceId);
  if (!template || template.id === hit.id) {
    return { todo: hit, todoId, subId };
  }
  const templateSub = mapInstanceSubToTemplateSub(hit, template, subId);
  if (!templateSub) return { todo: template, todoId: template.id, subId };
  return { todo: template, todoId: template.id, subId: templateSub.id };
}
function removeRecurrenceCompletionsForDay(s, recId, day, keepTemplateId) {
  const filtered = s.todos.filter((td) => !(
    td.recurrenceId === recId
    && !normalizedTodoPeriod(td)
    && completionDay(td) === day
    && td.id !== keepTemplateId
  ));
  if (filtered.length === s.todos.length) return s;
  return { ...s, todos: filtered };
}
function applySubTaskToggleResult(s, todo, todoId, subs, day, allDone) {
  let t = { ...todo, subTasks: subs };
  if (allDone && normalizedTodoPeriod(t) && recurrenceRuleForTodo(t, s.recurrences)) {
    return completeRecurringTodo(s, t, day, subs);
  }
  if (allDone) {
    return {
      ...s,
      todos: s.todos.map((x) => (x.id === todoId ? applyTodoDoneState(t, true, day) : x)),
    };
  }
  let next = {
    ...s,
    todos: s.todos.map((x) => (x.id === todoId ? {
      ...t,
      done: false,
      completedAt: null,
      completedDay: null,
    } : x)),
  };
  const rec = recurrenceRuleForTodo(t, s.recurrences);
  if (rec && normalizedTodoPeriod(t)) {
    next = removeRecurrenceCompletionsForDay(next, rec.id, day, t.id);
  }
  return next;
}
function resetTemplateSubTasks(subs) {
  return (subs || []).map((st) => ({ ...st, done: false, completedAt: null }));
}
function createRecurrenceCompletionInstance(t, day, recId) {
  return {
    id: uid(),
    projectId: t.projectId,
    title: t.title,
    pinned: false,
    pinnedAt: null,
    dueDate: null,
    startDate: null,
    endDate: null,
    order: t.order ?? 0,
    done: true,
    completedAt: completedAtNow(),
    completedDay: day,
    recurrenceId: recId,
    memoId: null,
    trackedSeconds: t.trackedSeconds ?? 0,
    subTasks: (t.subTasks || []).map((st) => ({
      id: uid(),
      title: st.title,
      done: !!st.done,
      completedAt: st.done ? (st.completedAt || completedAtNow()) : null,
      linkUrl: st.linkUrl || "",
    })),
    createdAt: day,
    roomVisible: !!t.roomVisible,
  };
}
function completeRecurringTodo(s, t, day, subsForInstance) {
  const rec = recurrenceRuleForTodo(t, s.recurrences);
  if (!rec || !normalizedTodoPeriod(t) || t.done) return s;
  if (hasRecurrenceCompletionForDay(rec.id, day, s.todos, t.id)) return s;
  const source = subsForInstance != null ? { ...t, subTasks: subsForInstance } : {
    ...t,
    subTasks: (t.subTasks || []).map((st) => ({
      ...st,
      done: true,
      completedAt: st.completedAt || completedAtNow(),
    })),
  };
  const instance = createRecurrenceCompletionInstance(source, day, rec.id);
  return {
    ...s,
    todos: [
      ...s.todos.map((td) => (td.id === t.id ? {
        ...td,
        done: false,
        completedAt: null,
        completedDay: null,
        subTasks: resetTemplateSubTasks(td.subTasks),
      } : td)),
      instance,
    ],
  };
}
function matchesTodoDay(t, day, today, recurrencesOpt) {
  const comp = completionDay(t);
  if (t.done) return comp === day;
  const recurrences = recurrencesOpt ?? getState().recurrences ?? [];
  const todos = getState().todos ?? [];
  const period = normalizedTodoPeriod(t);
  if (period) {
    if (day < period.start || day > period.end) return false;
    const rec = recurrenceRuleForTodo(t, recurrences);
    if (rec && !dayMatchesRecurrence(day, rec)) return false;
    if (rec && hasRecurrenceCompletionForDay(rec.id, day, todos, t.id)) return false;
    return true;
  }
  if (t.dueDate === day) return true;
  if (day === today && !t.dueDate && !period) return true;
  if (day === today && t.dueDate && t.dueDate < today) return true;
  return false;
}

function pomoCycleMs(timer) {
  return (timer?.lengthMin ?? 25) * 60 * 1000;
}

function pomoIdleWorkMs(timer) {
  return (timer?.workMin ?? 25) * 60 * 1000;
}

// ---- 액션들 ----
const actions = {
  // ----- 프로젝트 -----
  switchProject(id) {
    setState(s => ({ ...s, currentProjectId: id }));
  },
  addProject({ name, path = "", stack = [], gitBranch = "main", cheatsheet = "" }) {
    const id = uid();
    setState(s => ({
      ...s,
      projects: [...s.projects, {
        id, name, path, stack, links: [],
        gitBranch, repoUrl: "", version: "0.1.0", nextVersion: "",
        cheatsheet, status: "active", createdAt: today(),
      }],
      currentProjectId: id,
    }));
  },
  updateProject(id, patch) {
    setState(s => ({
      ...s,
      projects: s.projects.map(p => p.id === id ? { ...p, ...patch } : p),
    }));
  },
  removeProject(id) {
    setState(s => {
      const remaining = s.projects.filter(p => p.id !== id);
      return {
        ...s,
        projects: remaining,
        currentProjectId: s.currentProjectId === id
          ? (remaining[0]?.id ?? null)
          : s.currentProjectId,
      };
    });
  },

  // ----- 할 일 -----
  addTodo(title, opts = {}) {
    if (!title?.trim()) return null;
    const id = uid();
    setState(s => {
      const myTodos = s.todos.filter(t => t.projectId === s.currentProjectId);
      const nextOrder = myTodos.reduce((m, t) => Math.max(m, t.order ?? 0), -1) + 1;
      return {
        ...s,
        todos: [...s.todos, {
          id, projectId: s.currentProjectId,
          title: title.trim(),
          pinned: !!opts.pinned, pinnedAt: opts.pinned ? Date.now() : null,
          dueDate: opts.dueDate ?? null,
          startDate: opts.startDate ?? null,
          endDate: opts.endDate ?? null,
          order: nextOrder,
          done: false, completedAt: null, completedDay: null,
          recurrenceId: opts.recurrenceId ?? null,
          memoId: opts.memoId ?? null,
          trackedSeconds: 0,
          subTasks: [],
          createdAt: opts.dueDate || today(),
          roomVisible: false,
        }],
      };
    });
    return id;
  },
  toggleTodo(id, opts = {}) {
    setState(s => {
      const t = s.todos.find(x => x.id === id);
      if (!t) return s;
      const day = opts.completionDay || today();

      if (t.done && t.recurrenceId && !normalizedTodoPeriod(t)) {
        if (!opts.completionDay || completionDay(t) === day) {
          return { ...s, todos: s.todos.filter(x => x.id !== id) };
        }
        return s;
      }

      if (!t.done && normalizedTodoPeriod(t) && recurrenceRuleForTodo(t, s.recurrences)) {
        return completeRecurringTodo(s, t, day);
      }

      return {
        ...s,
        todos: s.todos.map((x) => (x.id === id ? applyTodoDoneState(x, !x.done, day) : x)),
      };
    });
  },
  setTodoDone(id, done, opts = {}) {
    const nextDone = !!done;
    const day = opts.completionDay || today();
    setState(s => {
      const t = s.todos.find(x => x.id === id);
      if (!t) return s;

      if (!nextDone && t.done && t.recurrenceId && !normalizedTodoPeriod(t)) {
        if (!opts.completionDay || completionDay(t) === day) {
          return { ...s, todos: s.todos.filter(x => x.id !== id) };
        }
        return s;
      }

      if (nextDone && !t.done && normalizedTodoPeriod(t) && recurrenceRuleForTodo(t, s.recurrences)) {
        return completeRecurringTodo(s, t, day);
      }

      return {
        ...s,
        todos: s.todos.map((x) => (x.id === id ? applyTodoDoneState(x, nextDone, day) : x)),
      };
    });
  },
  togglePin(id) {
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === id
        ? { ...t, pinned: !t.pinned, pinnedAt: !t.pinned ? Date.now() : null }
        : t),
    }));
  },
  // 작업방에 이 할 일 제목을 공개할지 토글 — 기본 false
  toggleTodoVisible(id) {
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === id ? { ...t, roomVisible: !t.roomVisible } : t),
    }));
  },
  setTodoDue(id, date) {
    setState(s => ({ ...s, todos: s.todos.map(t => t.id === id ? { ...t, dueDate: date || null } : t) }));
  },
  setTodoPeriod(id, startDate, endDate) {
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === id ? {
        ...t,
        startDate: startDate || null,
        endDate: endDate || null,
      } : t),
    }));
  },
  // 기간·반복 일정 해제 — 추가했던 날짜(createdAt)로 되돌림
  clearTodoSchedule(id) {
    setState(s => {
      const t = s.todos.find(x => x.id === id);
      if (!t) return s;
      const recId = t.recurrenceId;
      const baseDate = localDayFromIso(t.createdAt)
        || String(t.createdAt || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0]
        || today();
      const todos = s.todos.map((td) => {
        if (td.id === id) {
          return {
            ...td,
            startDate: null,
            endDate: null,
            dueDate: baseDate,
            recurrenceId: null,
            done: false,
            completedAt: null,
            completedDay: null,
          };
        }
        if (recId && td.recurrenceId === recId && td.id !== id) {
          return { ...td, recurrenceId: null };
        }
        return td;
      });
      const recurrences = recId
        ? (s.recurrences ?? []).filter(r => r.id !== recId)
        : (s.recurrences ?? []);
      return { ...s, todos, recurrences };
    });
  },
  // 달력 드롭으로 단일 날짜 이동 — dueDate 만 설정하고 기간은 비움.
  moveTodoToDate(id, date) {
    if (!date) return;
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === id ? {
        ...t,
        dueDate: date,
        startDate: null,
        endDate: null,
      } : t),
    }));
  },
  // ----- 서브태스크 -----
  addSubTask(todoId, title, opts = {}) {
    const text = (title || "").trim();
    if (!text) return;
    const linkUrl = String(opts.linkUrl || "").trim();
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === todoId ? {
        ...t,
        subTasks: [...(t.subTasks || []), {
          id: uid(), title: text, done: false, completedAt: null, linkUrl,
        }],
      } : t),
    }));
  },
  toggleSubTask(todoId, subId, opts = {}) {
    const day = opts.completionDay || today();
    setState(s => {
      const target = resolveSubTaskToggleTarget(s, todoId, subId);
      if (!target) return s;
      const { todo, todoId: resolvedTodoId, subId: resolvedSubId } = target;
      const subs = (todo.subTasks || []).map((st) => (st.id === resolvedSubId ? {
        ...st,
        done: !st.done,
        completedAt: !st.done ? completedAtNow() : null,
      } : st));
      if (!subs.length) {
        return { ...s, todos: s.todos.map(x => x.id === resolvedTodoId ? { ...x, subTasks: subs } : x) };
      }
      const allDone = subs.every((st) => st.done);
      return applySubTaskToggleResult(s, todo, resolvedTodoId, subs, day, allDone);
    });
  },
  setSubTaskDone(todoId, subId, done, opts = {}) {
    const nextDone = !!done;
    const day = opts.completionDay || today();
    setState(s => {
      const target = resolveSubTaskToggleTarget(s, todoId, subId);
      if (!target) return s;
      const { todo, todoId: resolvedTodoId, subId: resolvedSubId } = target;
      const subs = (todo.subTasks || []).map((st) => (st.id === resolvedSubId ? {
        ...st,
        done: nextDone,
        completedAt: nextDone ? (st.completedAt || completedAtNow()) : null,
      } : st));
      if (!subs.length) {
        return { ...s, todos: s.todos.map(x => x.id === resolvedTodoId ? { ...x, subTasks: subs } : x) };
      }
      const allDone = subs.every((st) => st.done);
      return applySubTaskToggleResult(s, todo, resolvedTodoId, subs, day, allDone);
    });
  },
  renameSubTask(todoId, subId, title) {
    const text = (title || "").trim();
    if (!text) return;
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === todoId ? {
        ...t,
        subTasks: (t.subTasks || []).map(st => st.id === subId ? { ...st, title: text } : st),
      } : t),
    }));
  },
  setSubTaskLink(todoId, subId, linkUrl) {
    const url = (linkUrl || "").trim();
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === todoId ? {
        ...t,
        subTasks: (t.subTasks || []).map(st => st.id === subId ? { ...st, linkUrl: url } : st),
      } : t),
    }));
  },
  removeSubTask(todoId, subId) {
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === todoId ? {
        ...t,
        subTasks: (t.subTasks || []).filter(st => st.id !== subId),
      } : t),
    }));
  },
  // 끌어서 다른 할 일의 하위로 넣기 — 원본은 top-level 에서 제거.
  // 한 레벨만 지원하므로, 드래그한 할 일에 서브태스크가 있으면 평탄화해서 흡수.
  nestAsSubTask(parentId, draggedId) {
    if (!parentId || !draggedId || parentId === draggedId) return;
    setState(s => {
      const dragged = s.todos.find(t => t.id === draggedId);
      if (!dragged) return s;
      if (!s.todos.find(t => t.id === parentId)) return s;
      const newSubs = [
        {
          id: uid(),
          title: dragged.title,
          done: dragged.done,
          completedAt: dragged.completedAt || null,
          linkUrl: dragged.linkUrl || "",
        },
        // 드래그한 할 일이 가지고 있던 기존 서브태스크도 같이 흡수
        ...(dragged.subTasks || []).map(st => ({
          id: uid(),
          title: st.title,
          done: !!st.done,
          completedAt: st.completedAt || null,
          linkUrl: st.linkUrl || "",
        })),
      ];
      return {
        ...s,
        todos: s.todos
          .map(t => t.id === parentId
            ? { ...t, subTasks: [...(t.subTasks || []), ...newSubs] }
            : t)
          .filter(t => t.id !== draggedId),
      };
    });
  },
  updateTodo(id, patch) {
    setState(s => ({ ...s, todos: s.todos.map(t => t.id === id ? { ...t, ...patch } : t) }));
  },
  addTodoFromSnapshot(todo, opts = {}) {
    const title = String(todo?.title || "").trim();
    if (!title) return null;
    const id = uid();
    setState(s => {
      const projectId = opts.projectId ?? s.currentProjectId;
      const myTodos = s.todos.filter(t => t.projectId === projectId);
      const nextOrder = myTodos.reduce((m, t) => Math.max(m, t.order ?? 0), -1) + 1;
      const done = !!todo.done;
      return {
        ...s,
        todos: [...s.todos, {
          id,
          projectId,
          title,
          pinned: !!todo.pinned,
          pinnedAt: todo.pinned ? Date.now() : null,
          dueDate: opts.dueDate ?? todo.dueDate ?? null,
          startDate: opts.startDate ?? todo.startDate ?? null,
          endDate: opts.endDate ?? todo.endDate ?? null,
          order: nextOrder,
          done,
          completedAt: done ? (todo.completedAt || completedAtNow()) : null,
          recurrenceId: null,
          memoId: null,
          trackedSeconds: todo.trackedSeconds ?? 0,
          subTasks: Array.isArray(todo.subTasks) ? todo.subTasks.map(st => {
            const subDone = !!st.done;
            return {
              id: uid(),
              title: String(st.title || "").trim(),
              done: subDone,
              completedAt: subDone ? (st.completedAt || completedAtNow()) : null,
              linkUrl: String(st.linkUrl || "").trim(),
            };
          }).filter(st => st.title) : [],
          createdAt: today(),
          roomVisible: false,
        }],
      };
    });
    return id;
  },
  restoreTodosSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.todos)) return;
    setState(s => ({
      ...s,
      todos: snapshot.todos,
      recurrences: Array.isArray(snapshot.recurrences) ? snapshot.recurrences : s.recurrences,
    }));
  },
  reorderTodoBefore(fromId, beforeId) {
    if (fromId === beforeId) return;
    setState(s => {
      const my = s.todos.filter(t => t.projectId === s.currentProjectId)
        .slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const fromIdx = my.findIndex(t => t.id === fromId);
      if (fromIdx < 0) return s;
      const [moved] = my.splice(fromIdx, 1);
      let beforeIdx = beforeId ? my.findIndex(t => t.id === beforeId) : my.length;
      if (beforeIdx < 0) beforeIdx = my.length;
      my.splice(beforeIdx, 0, moved);
      const newOrder = {};
      my.forEach((t, i) => { newOrder[t.id] = i; });
      return { ...s, todos: s.todos.map(t => t.projectId === s.currentProjectId ? { ...t, order: newOrder[t.id] ?? t.order } : t) };
    });
  },
  autoSortTodos() {
    setState(s => {
      const my = s.todos.filter(t => t.projectId === s.currentProjectId && !t.done && !t.pinned).slice();
      my.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return (a.order ?? 0) - (b.order ?? 0);
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
      const newOrder = {};
      my.forEach((t, i) => { newOrder[t.id] = i; });
      return { ...s, todos: s.todos.map(t => newOrder[t.id] != null ? { ...t, order: newOrder[t.id] } : t) };
    });
  },
  removeTodo(id) {
    setState(s => {
      const target = s.todos.find(t => t.id === id);
      if (!target?.recurrenceId) {
        return {
          ...s,
          todos: s.todos.filter(t => t.id !== id),
          memos: (s.memos ?? []).map(m => m.todoId === id ? { ...m, todoId: null } : m),
        };
      }
      return {
        ...s,
        recurrences: (s.recurrences ?? []).filter(r => r.id !== target.recurrenceId),
        todos: s.todos
          .filter(t => t.id !== id)
          .map(t => t.recurrenceId === target.recurrenceId ? { ...t, recurrenceId: null } : t),
        memos: (s.memos ?? []).map(m => m.todoId === id ? { ...m, todoId: null } : m),
      };
    });
  },

  // ----- 반복 (템플릿) -----
  addRecurrence({ title, frequency, weeklyDays = [] }) {
    const id = uid();
    const normalizedFrequency = normalizeFrequency(frequency);
    setState(s => ({
      ...s,
      recurrences: [...(s.recurrences ?? []), {
        id, projectId: s.currentProjectId,
        title: title.trim(),
        frequency: normalizedFrequency,
        weeklyDays: normalizedFrequency === "weekly" ? normalizeWeeklyDays(weeklyDays) : [],
        active: true,
        createdAt: today(),
      }],
    }));
    return id;
  },
  updateRecurrence(id, patch) {
    setState(s => ({
      ...s,
      recurrences: (s.recurrences ?? []).map(r => {
        if (r.id !== id) return r;
        const nextFrequency = normalizeFrequency(patch.frequency ?? r.frequency);
        const next = { ...r, ...patch, frequency: nextFrequency };
        return {
          ...next,
          weeklyDays: nextFrequency === "weekly" ? normalizeWeeklyDays(next.weeklyDays) : [],
        };
      }),
    }));
  },
  removeRecurrence(id) {
    setState(s => ({
      ...s,
      recurrences: (s.recurrences ?? []).filter(r => r.id !== id),
      // 연결된 할 일은 recurrenceId 만 끊고 본체는 유지
      todos: s.todos.map(t => t.recurrenceId === id ? { ...t, recurrenceId: null } : t),
    }));
  },
  // 오늘 생성돼야 할 반복 인스턴스를 만든다. 중복 생성 방지: (rule.id + dueDate=today) 조합 검사.
  generateRecurrences() {
    setState(s => {
      const t = today();
      const [yy, mm, dd] = t.split("-").map(Number);
      const dow = new Date(yy, mm - 1, dd).getDay();   // 0=일 .. 6=토 (로컬)
      const rules = (s.recurrences ?? []).filter(r => r.active);
      const newTodos = [];
      const orderMap = {};
      // 프로젝트별 현재 최대 order
      for (const r of rules) {
        // 기간 스케줄(달력 드래그)과 연결된 규칙은 단일 할 일로 표시 — 별도 인스턴스 생성 안 함
        const periodLinked = s.todos.some(td => td.recurrenceId === r.id && normalizedTodoPeriod(td));
        if (periodLinked) continue;
        const matches =
          r.frequency === "daily" ? true
          : r.frequency === "weekdays" ? (dow >= 1 && dow <= 5)
          : r.frequency === "weekly" ? (r.weeklyDays || []).includes(dow)
          : false;
        if (!matches) continue;
        const exists = s.todos.some(td => td.recurrenceId === r.id && td.dueDate === t && td.projectId === r.projectId);
        if (exists) continue;
        if (orderMap[r.projectId] == null) {
          orderMap[r.projectId] = s.todos.filter(td => td.projectId === r.projectId).reduce((m, td) => Math.max(m, td.order ?? 0), -1);
        }
        orderMap[r.projectId] += 1;
        newTodos.push({
          id: uid(), projectId: r.projectId,
          title: r.title, pinned: false, pinnedAt: null,
          dueDate: t, startDate: null, endDate: null, order: orderMap[r.projectId],
          done: false, completedAt: null,
          memoId: null,
          recurrenceId: r.id, trackedSeconds: 0,
          createdAt: t,
        });
      }
      if (!newTodos.length && s.lastGenDate === t) return s;
      return { ...s, todos: [...s.todos, ...newTodos], lastGenDate: t };
    });
  },

  // ----- 프롬프트 -----
  addPrompt(text) {
    if (!text?.trim()) return;
    setState(s => ({
      ...s,
      prompts: [{ id: uid(), text: text.trim(), uses: 0, createdAt: today() }, ...s.prompts],
    }));
  },
  updatePrompt(id, text) {
    setState(s => ({
      ...s,
      prompts: s.prompts.map(p => p.id === id ? { ...p, text } : p),
    }));
  },
  removePrompt(id) {
    setState(s => ({ ...s, prompts: s.prompts.filter(p => p.id !== id) }));
  },
  copyPrompt(id) {
    setState(s => ({
      ...s,
      prompts: s.prompts.map(p => p.id === id ? { ...p, uses: (p.uses ?? 0) + 1 } : p),
    }));
    const p = getState().prompts.find(x => x.id === id);
    if (p && navigator.clipboard) navigator.clipboard.writeText(p.text).catch(() => {});
  },

  // ----- 이메일 -----
  addEmail({ who, subject, preview = "", hot = false }) {
    if (!who?.trim() || !subject?.trim()) return;
    setState(s => ({
      ...s,
      emails: [
        { id: uid(), who: who.trim(), subject: subject.trim(), preview: preview.trim(),
          time: "방금", replied: false, hot, createdAt: today() },
        ...s.emails,
      ],
    }));
  },
  // 받은 메일 붙여넣기 (문의함)
  addInquiry({ from = "", subject = "", body = "" }) {
    if (!body.trim() && !subject.trim()) return;
    setState(s => ({
      ...s,
      emails: [
        { id: uid(), who: from.trim() || "문의", subject: subject.trim(),
          preview: "", body: body.trim(), draft: "", platformUrl: "",
          time: "방금", replied: false, hot: false, createdAt: today(), ts: Date.now() },
        ...s.emails,
      ],
    }));
  },
  updateEmail(id, patch) {
    setState(s => ({
      ...s,
      emails: s.emails.map(e => e.id === id ? { ...e, ...patch } : e),
    }));
  },
  setMailUrl(url) {
    setState(s => ({ ...s, mailUrl: url }));
  },
  toggleReplied(id) {
    setState(s => ({
      ...s,
      emails: s.emails.map(e => e.id === id ? { ...e, replied: !e.replied } : e),
    }));
  },
  removeEmail(id) {
    setState(s => ({ ...s, emails: s.emails.filter(e => e.id !== id) }));
  },

  // ----- AI 북마크 -----
  addBookmark({ title, ok = true, note = "" }) {
    if (!title?.trim()) return;
    setState(s => ({
      ...s,
      aiBookmarks: [
        { id: uid(), projectId: s.currentProjectId, date: today(),
          title: title.trim(), ok, note: note.trim() },
        ...s.aiBookmarks,
      ],
    }));
  },
  updateBookmark(id, patch) {
    setState(s => ({
      ...s,
      aiBookmarks: s.aiBookmarks.map(b => b.id === id ? { ...b, ...patch } : b),
    }));
  },
  removeBookmark(id) {
    setState(s => ({ ...s, aiBookmarks: s.aiBookmarks.filter(b => b.id !== id) }));
  },

  // ----- 명령어 치트 -----
  addCommand({ label = "", code = "" }) {
    if (!code?.trim()) return;
    setState(s => ({
      ...s,
      commands: [
        { id: uid(), projectId: s.currentProjectId,
          label: label.trim(), code: code.trim(),
          uses: 0, createdAt: today() },
        ...s.commands,
      ],
    }));
  },
  updateCommand(id, patch) {
    setState(s => ({
      ...s,
      commands: s.commands.map(c => c.id === id ? { ...c, ...patch } : c),
    }));
  },
  removeCommand(id) {
    setState(s => ({ ...s, commands: s.commands.filter(c => c.id !== id) }));
  },
  copyCommand(id) {
    setState(s => ({
      ...s,
      commands: s.commands.map(c => c.id === id ? { ...c, uses: (c.uses ?? 0) + 1 } : c),
    }));
    const c = getState().commands.find(x => x.id === id);
    if (c && navigator.clipboard) navigator.clipboard.writeText(c.code).catch(() => {});
  },

  // ----- 메모 (단일 html 본문) -----
  addMemo({ html = "", icon, todoId = null, title = "" } = {}) {
    const id = uid();
    const now = new Date().toISOString();
    setState(s => ({
      ...s,
      memos: [
        { id, projectId: s.currentProjectId,
          title: title || memoTitleFromHtml(html), html, manualTitle: !!title,
          todoId,
          icon: icon || randomMemoIcon(),
          createdAt: now, updatedAt: now },
        ...(s.memos ?? []),
      ],
    }));
    return id;
  },
  ensureTodoMemo(todoId) {
    let memoId = null;
    setState(s => {
      const todo = s.todos.find(t => t.id === todoId);
      if (!todo) return s;
      const memos = s.memos ?? [];
      const existing = (todo.memoId && memos.find(m => m.id === todo.memoId))
        || memos.find(m => m.todoId === todoId);
      if (existing) {
        memoId = existing.id;
        const missingSubTasksHtml = todoSubTaskMemoHtml(todo, existing.html || "");
        const now = new Date().toISOString();
        return {
          ...s,
          todos: s.todos.map(t => t.id === todoId ? { ...t, memoId } : t),
          memos: memos.map(m => m.id === memoId ? {
            ...m,
            todoId,
            html: missingSubTasksHtml ? `${m.html || ""}${missingSubTasksHtml}` : m.html,
            updatedAt: missingSubTasksHtml ? now : m.updatedAt,
          } : m),
        };
      }
      memoId = uid();
      const now = new Date().toISOString();
      const memo = {
        id: memoId,
        projectId: todo.projectId || s.currentProjectId,
        todoId,
        title: todo.title,
        html: todoMemoHtml(todo),
        manualTitle: true,
        icon: 4,
        createdAt: now,
        updatedAt: now,
      };
      return {
        ...s,
        todos: s.todos.map(t => t.id === todoId ? { ...t, memoId } : t),
        memos: [memo, ...memos],
      };
    });
    return memoId;
  },
  updateMemo(id, patch) {
    setState(s => ({
      ...s,
      memos: (s.memos ?? []).map(m => {
        if (m.id !== id) return m;
        const touchesContent = "html" in patch || "title" in patch;
        const next = { ...m, ...patch };
        if (touchesContent) next.updatedAt = new Date().toISOString();
        if ("title" in patch) next.manualTitle = true;
        if (!next.manualTitle && !("title" in patch) && "html" in patch) next.title = memoTitleFromHtml(next.html);
        return next;
      }),
    }));
  },
  removeMemo(id) {
    setState(s => ({
      ...s,
      memos: (s.memos ?? []).filter(m => m.id !== id),
      todos: (s.todos ?? []).map(t => t.memoId === id ? { ...t, memoId: null } : t),
    }));
  },

  // ----- 회고 (날짜별 1개) -----
  saveRetro({ date = today(), text = "", good = "", bad = "", mood = null }) {
    setState(s => {
      const others = s.retros.filter(r => r.date !== date);
      // 모두 비었으면 삭제
      if (!text.trim() && !good.trim() && !bad.trim() && !mood) {
        return { ...s, retros: others };
      }
      return {
        ...s,
        retros: [...others, { id: uid(), date, text, good, bad, mood }]
                 .sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
  },
  // 기분만 빠르게 설정 (다른 필드는 기존 값 유지)
  setMood(date, mood) {
    setState(s => {
      const prev = s.retros.find(r => r.date === date);
      const others = s.retros.filter(r => r.date !== date);
      if (!mood && !prev?.text?.trim() && !prev?.good?.trim() && !prev?.bad?.trim()) {
        return { ...s, retros: others };
      }
      const next = {
        id: prev?.id ?? uid(),
        date,
        text: prev?.text ?? "",
        good: prev?.good ?? "",
        bad:  prev?.bad  ?? "",
        mood,
      };
      return { ...s, retros: [...others, next].sort((a, b) => b.date.localeCompare(a.date)) };
    });
  },

  // ----- 플레이리스트 (유튜브) -----
  addTrack({ url, videoId, title = "" }) {
    if (!videoId) return;
    setState(s => ({
      ...s,
      playlist: [...(s.playlist ?? []), {
        id: uid(), url, videoId,
        title: title.trim() || "YouTube 트랙",
        createdAt: today(),
      }],
    }));
  },
  removeTrack(id) {
    setState(s => ({ ...s, playlist: (s.playlist ?? []).filter(t => t.id !== id) }));
  },

  // ----- 디데이 -----
  setDday(patch) {
    setState(s => ({ ...s, dday: { ...(s.dday ?? {}), ...patch } }));
  },

  // ----- 달력 메모/일기 (날짜별) -----
  setSelectedDate(date) {
    setState(s => ({ ...s, selectedDate: date }));
  },
  setNote(date, text) {
    setState(s => ({ ...s, notes: { ...s.notes, [date]: text } }));
  },
  appendNote(date, line) {
    if (!line?.trim()) return;
    setState(s => {
      const prev = s.notes[date] ?? "";
      return { ...s, notes: { ...s.notes, [date]: prev ? prev + "\n" + line.trim() : line.trim() } };
    });
  },

  // ----- 주간 노트 (월요일 기준) -----
  setWeekNote(monday, text) {
    setState(s => ({ ...s, weekNotes: { ...(s.weekNotes ?? {}), [monday]: text } }));
  },

  // ----- 빠른 답장 프리셋 -----
  addReplyPreset({ label = "", text = "" } = {}) {
    const id = uid();
    setState(s => ({
      ...s,
      replyPresets: [
        { id, label: label.trim(), text, createdAt: today() },
        ...(s.replyPresets ?? []),
      ],
    }));
    return id;
  },
  updateReplyPreset(id, patch) {
    setState(s => ({
      ...s,
      replyPresets: (s.replyPresets ?? []).map(p => p.id === id ? { ...p, ...patch } : p),
    }));
  },
  removeReplyPreset(id) {
    setState(s => ({ ...s, replyPresets: (s.replyPresets ?? []).filter(p => p.id !== id) }));
  },

  // ----- Stuck note -----
  setStuck(text) {
    setState(s => ({
      ...s,
      stuck: { ...s.stuck, [s.currentProjectId]: text },
    }));
  },

  // ----- 타이머 / 알림 -----
  setTimerLength(min) {
    setState(s => ({ ...s, timer: { ...s.timer, lengthMin: min } }));
  },
  setTimerEnabled(enabled) {
    setState(s => ({ ...s, timer: { ...s.timer, enabled } }));
  },
  startCycle() {
    setState(s => ({ ...s, timer: {
      ...s.timer,
      cycleStartedAt: Date.now(),
      paused: false,
      pausedRemainingMs: null,
    }}));
  },
  pauseCycle() {
    setState(s => {
      if (!s.timer.cycleStartedAt || s.timer.paused) return s;
      const lenMs = pomoCycleMs(s.timer);
      const elapsed = Date.now() - s.timer.cycleStartedAt;
      const remaining = Math.max(0, lenMs - elapsed);
      return { ...s, timer: { ...s.timer, paused: true, pausedRemainingMs: remaining } };
    });
  },
  resumeCycle() {
    setState(s => {
      if (!s.timer.paused) return s;
      const lenMs = pomoCycleMs(s.timer);
      const remaining = s.timer.pausedRemainingMs ?? lenMs;
      // 남은 시간이 이제부터 흐르도록 시작 시각을 보정
      const cycleStartedAt = Date.now() - (lenMs - remaining);
      return { ...s, timer: { ...s.timer, paused: false, cycleStartedAt, pausedRemainingMs: null } };
    });
  },
  markStretched() {
    // 이번 사이클 끊고 새 사이클 시작
    setState(s => ({ ...s, timer: {
      ...s.timer,
      cycleStartedAt: Date.now(),
      paused: false,
      pausedRemainingMs: null,
      lastNotifiedAt: null,
    }}));
  },
  startPomodoro() {
    setState(s => ({ ...s, timer: {
      ...s.timer,
      phase: "work",
      lengthMin: s.timer.workMin ?? 25,
      cycleStartedAt: Date.now(),
      paused: false,
      pausedRemainingMs: null,
      lastNotifiedAt: null,
    }}));
  },
  stopPomodoro() {
    setState(s => ({ ...s, timer: {
      ...s.timer,
      phase: "idle",
      lengthMin: s.timer.workMin ?? 25,
      cycleStartedAt: null,
      paused: false,
      pausedRemainingMs: null,
      lastNotifiedAt: null,
    }}));
  },
  advancePomodoroPhase() {
    setState(s => {
      const t = s.timer;
      if (t.phase === "work") {
        return { ...s, timer: {
          ...t,
          phase: "break",
          lengthMin: t.breakMin ?? 5,
          cycleStartedAt: Date.now(),
          paused: false,
          pausedRemainingMs: null,
          lastNotifiedAt: null,
          pomodoroCount: (t.pomodoroCount ?? 0) + 1,
        }};
      }
      if (t.phase === "break") {
        return { ...s, timer: {
          ...t,
          phase: "idle",
          lengthMin: t.workMin ?? 25,
          cycleStartedAt: null,
          paused: false,
          pausedRemainingMs: null,
          lastNotifiedAt: null,
        }};
      }
      return s;
    });
  },
  markNotified() {
    setState(s => ({ ...s, timer: { ...s.timer, lastNotifiedAt: Date.now() } }));
  },
  setNotificationsGranted(g) {
    setState(s => ({ ...s, timer: { ...s.timer, notificationsGranted: g } }));
  },
  setPomoSettings(patch) {
    setState(s => ({ ...s, timer: { ...s.timer, ...patch } }));
  },

  // ----- 작업 시간 트래킹 (날짜 × 프로젝트) -----
  // 현재 활성 프로젝트로 분류해서 누적. projectId 명시도 가능.
  addWorkMinutes(min, projectId) {
    if (min <= 0) return;
    const t = today();
    const now = Date.now();
    setState(s => {
      const pid = projectId !== undefined ? projectId : (s.currentProjectId ?? null);
      const sessions = s.workSessions.slice();
      const idx = sessions.findIndex(w => w.date === t && w.projectId === pid);
      if (idx >= 0) {
        sessions[idx] = { ...sessions[idx], minutes: sessions[idx].minutes + min, lastTs: now };
      } else {
        sessions.push({ date: t, projectId: pid, minutes: min, lastTs: now });
      }
      return { ...s, workSessions: sessions };
    });
  },
  // 작업 시간 초기화. ActivityTracker가 누적 중이던 초도 같이 비우라고 이벤트 발사.
  //   resetWorkMinutes()                       → 오늘 모든 프로젝트
  //   resetWorkMinutes(date)                   → 그 날짜 모든 프로젝트
  //   resetWorkMinutes(date, projectId)        → 그 날짜의 특정 프로젝트만
  resetWorkMinutes(date, projectId) {
    const d = date || today();
    setState(s => ({
      ...s,
      workSessions: s.workSessions.filter(w => {
        if (w.date !== d) return true;
        if (projectId !== undefined) return w.projectId !== projectId;
        return false;
      }),
    }));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("work-minutes-reset", { detail: { date: d, projectId } }));
    }
  },

  // ----- 곡 재생 카운트 (날짜·videoId 별) -----
  recordPlay({ videoId, title = "" } = {}) {
    if (!videoId) return;
    const t = today();
    setState(s => {
      const plays = { ...(s.songPlays ?? {}) };
      const day = { ...(plays[t] ?? {}) };
      const prev = day[videoId] || { title: "", count: 0 };
      day[videoId] = { title: title || prev.title || "", count: (prev.count || 0) + 1 };
      plays[t] = day;
      return { ...s, songPlays: plays };
    });
  },

  // ----- 위험: 리셋 -----
  async hardReset() {
    const msg = (window.i18n && window.i18n.t) ? window.i18n.t("set.resetConfirm") : "정말 모든 데이터를 지우고 초기 상태로 되돌릴까요?";
    const ok = await (window.dialog ? window.dialog.confirm(msg) : Promise.resolve(confirm(msg)));
    if (!ok) return;
    setState(seed());
  },
};

// ---- React 훅 ----
function useDiary() {
  const [, setTick] = React.useState(0);
  React.useEffect(() => subscribe(() => setTick(x => x + 1)), []);
  return { state: _state, actions };
}

// ---- 파생 셀렉터 ----
const select = {
  currentProject: (s) => s.projects.find(p => p.id === s.currentProjectId) ?? null,
  todosForCurrent: (s) => s.todos.filter(t => t.projectId === s.currentProjectId),
  bookmarksForCurrent: (s) => s.aiBookmarks.filter(b => b.projectId === s.currentProjectId),
  commandsForCurrent: (s) => (s.commands ?? []).filter(c => c.projectId === s.currentProjectId),
  memosForCurrent: (s) => (s.memos ?? [])
    .filter(m => m.projectId === s.currentProjectId)
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
  retroForDate: (s, date = today()) => s.retros.find(r => r.date === date) ?? null,
  stuckForCurrent: (s) => s.stuck[s.currentProjectId] ?? "",
  workMinutesToday: (s) => {
    const t = today();
    return (s.workSessions ?? []).reduce(
      (sum, w) => w.date === t ? sum + (w.minutes || 0) : sum, 0
    );
  },
  // 특정 날짜의 총 작업시간
  workMinutesForDate: (s, date) => {
    return (s.workSessions ?? []).reduce(
      (sum, w) => w.date === date ? sum + (w.minutes || 0) : sum, 0
    );
  },
  // 특정 날짜의 프로젝트별 작업시간 — [{ projectId, project, minutes }] 분 내림차순
  workByProjectForDate: (s, date) => {
    const map = new Map();
    (s.workSessions ?? []).forEach(w => {
      if (w.date !== date) return;
      map.set(w.projectId ?? null, (map.get(w.projectId ?? null) ?? 0) + (w.minutes || 0));
    });
    const projects = s.projects ?? [];
    return [...map.entries()]
      .map(([pid, mins]) => ({
        projectId: pid,
        project: projects.find(p => p.id === pid) ?? null,
        minutes: mins,
      }))
      .filter(x => x.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
  },
  /** 연속 작업일 — workSessions·완료 할 일 기준 (일기 retros 아님) */
  workStreak: (s) => computeWorkStreak(s),
  // 하루 단위 통합 — 그 날의 할 일(마감 + 그 날 완료) / 작업분 / 회고 / 톱 곡
  dayBundle: (s, date) => {
    const pid = s.currentProjectId;
    const todos = (s.todos ?? []).filter(t => t.projectId === pid);
    const t = today();
    const items = todos.filter(todo => matchesTodoDay(todo, date, t));
    const totalSec = items.reduce((sum, t) => sum + (t.trackedSeconds || 0), 0);
    const sess = (s.workSessions ?? []).find(w => w.date === date);
    // 그 날 가장 많이 들은 곡
    const plays = (s.songPlays ?? {})[date] ?? {};
    let topSong = null;
    for (const [vid, info] of Object.entries(plays)) {
      if (!topSong || (info.count || 0) > (topSong.count || 0)) {
        topSong = { videoId: vid, title: info.title || "", count: info.count || 0 };
      }
    }
    return {
      date,
      items,
      doneCount: items.filter(t => t.done).length,
      totalCount: items.length,
      itemSeconds: totalSec,
      workMinutes: sess?.minutes ?? 0,
      workEndTs: sess?.lastTs ?? null,
      retro: s.retros.find(r => r.date === date) ?? null,
      topSong,
    };
  },
};

// 글로벌 노출
window.diary = {
  useDiary, actions, select, today, fmtKDate, fmtKDateShort, getState, memoTitleFromHtml, MEMO_ICONS,
  pomoCycleMs, pomoIdleWorkMs, matchesTodoDay, dayMatchesRecurrence, completionDay, localDayFromIso, completedAtNow,
};
