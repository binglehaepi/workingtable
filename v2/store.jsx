/* global React */
// ===========================================================
// 바이브 다이어리 — 데이터 레이어
// localStorage 한 키에 전체 상태를 JSON으로 저장.
// useDiary() 훅 하나로 모든 컴포넌트가 동일한 상태를 공유.
// Electron/Tauri로 래핑해도 그대로 동작 (저장 경로만 바꾸면 됨).
// ===========================================================

const STORAGE_KEY = "vibe-diary.v1";

// ---- 유틸 ----
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const fmtKDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = ["일","월","화","수","목","금","토"][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${dow})`;
};
const fmtKDateShort = (iso) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
};

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
    prompts: [],
    emails: [],
    aiBookmarks: [],
    commands: [],
    retros: [],
    playlist: [],
    dday: { date: "", label: "" },
    mailUrl: "",
    notes: {},
    selectedDate: t,
    stuck: {},
    timer: {
      lengthMin: 30,   // 한 사이클 분
      enabled: true,
      cycleStartedAt: null,        // Date.now() — null이면 아직 안 시작
      paused: false,
      pausedRemainingMs: null,     // 일시정지 시 남은 시간 보존
      notificationsGranted: false,
      lastNotifiedAt: null,        // 알림 중복 발송 방지
    },
    workSessions: [],
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
    data.prompts     ??= [];
    data.emails      ??= [];
    data.aiBookmarks ??= [];
    data.retros      ??= [];
    data.playlist    ??= [];
    data.dday        ??= { date: "", label: "" };
    data.mailUrl     ??= "";
    data.notes       ??= {};
    data.selectedDate = today();   // 시작 시 항상 오늘
    data.stuck       ??= {};
    // 메일에 body/draft/platformUrl 보강
    data.emails = (data.emails ?? []).map(e => ({ body: "", draft: "", platformUrl: "", ...e }));
    data.timer       ??= { lengthMin: 30, enabled: true, cycleStartedAt: null, paused: false, pausedRemainingMs: null, notificationsGranted: false, lastNotifiedAt: null };
    data.workSessions ??= [];
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
  addTodo(text, opts = {}) {
    if (!text?.trim()) return;
    setState(s => ({
      ...s,
      todos: [...s.todos, {
        id: uid(), projectId: s.currentProjectId,
        text: text.trim(), done: false, hot: !!opts.hot,
        createdAt: today(),
      }],
    }));
  },
  toggleTodo(id) {
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === id
        ? { ...t, done: !t.done, doneAt: !t.done ? today() : undefined, doneTs: !t.done ? Date.now() : undefined }
        : t),
    }));
  },
  toggleHot(id) {
    setState(s => ({
      ...s,
      todos: s.todos.map(t => t.id === id ? { ...t, hot: !t.hot } : t),
    }));
  },
  removeTodo(id) {
    setState(s => ({ ...s, todos: s.todos.filter(t => t.id !== id) }));
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

  // ----- 회고 (날짜별 1개) -----
  saveRetro({ date = today(), text = "", good = "", bad = "" }) {
    setState(s => {
      const others = s.retros.filter(r => r.date !== date);
      // 모두 비었으면 삭제
      if (!text.trim() && !good.trim() && !bad.trim()) {
        return { ...s, retros: others };
      }
      return {
        ...s,
        retros: [...others, { id: uid(), date, text, good, bad }]
                 .sort((a, b) => b.date.localeCompare(a.date)),
      };
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
      const lenMs = s.timer.lengthMin * 60 * 1000;
      const elapsed = Date.now() - s.timer.cycleStartedAt;
      const remaining = Math.max(0, lenMs - elapsed);
      return { ...s, timer: { ...s.timer, paused: true, pausedRemainingMs: remaining } };
    });
  },
  resumeCycle() {
    setState(s => {
      if (!s.timer.paused) return s;
      const lenMs = s.timer.lengthMin * 60 * 1000;
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
  markNotified() {
    setState(s => ({ ...s, timer: { ...s.timer, lastNotifiedAt: Date.now() } }));
  },
  setNotificationsGranted(g) {
    setState(s => ({ ...s, timer: { ...s.timer, notificationsGranted: g } }));
  },

  // ----- 작업 시간 트래킹 -----
  addWorkMinutes(min) {
    if (min <= 0) return;
    const t = today();
    setState(s => {
      const sessions = s.workSessions.slice();
      const idx = sessions.findIndex(w => w.date === t);
      if (idx >= 0) {
        sessions[idx] = { ...sessions[idx], minutes: sessions[idx].minutes + min };
      } else {
        sessions.push({ date: t, minutes: min });
      }
      return { ...s, workSessions: sessions };
    });
  },

  // ----- 위험: 리셋 -----
  hardReset() {
    const msg = (window.i18n && window.i18n.t) ? window.i18n.t("set.resetConfirm") : "정말 모든 데이터를 지우고 초기 시드로 되돌릴까요?";
    if (!confirm(msg)) return;
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
  retroForDate: (s, date = today()) => s.retros.find(r => r.date === date) ?? null,
  stuckForCurrent: (s) => s.stuck[s.currentProjectId] ?? "",
  workMinutesToday: (s) => {
    const t = today();
    const sess = s.workSessions.find(w => w.date === t);
    return sess?.minutes ?? 0;
  },
};

// 글로벌 노출
window.diary = { useDiary, actions, select, today, fmtKDate, fmtKDateShort, getState };
