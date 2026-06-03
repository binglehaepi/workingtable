/* global React, diary, useI18n, L */
// ===========================================================
// 작업 시간 자동 트래커 + 회고 자동 모달
//
// ActivityTracker  — 보이지 않는 컴포넌트. 한 번만 마운트.
//   페이지 활성 상태(보임+포커스+비-유휴) 시간을 매 10초 체크해서
//   1분 단위로 store.workSessions에 누적.
//
// RetroModal       — "오늘 작업 마치기" 흐름. 모달로 회고 받고
//   타이머 정지. 어디서든 window.openRetroModal()으로 열기.
//
// openRetroModal() — 전역 헬퍼. 버튼들이 이걸 호출.
// ===========================================================

const { useState, useEffect, useRef } = React;

const TICK_MS = 1000;            // 1초 단위로 체크 — 미니 위젯의 HH:MM:SS 실시간 표시용
const TICK_SEC = TICK_MS / 1000;

// 모듈 레벨 pendingSec — 미니 위젯 등 외부에서 읽을 수 있게.
// store의 workMinutesToday(분 단위 커밋분) + 이 pendingSec(아직 안 커밋된 초)를 합치면
// 진짜 초 단위 작업 시간이 나옴. ActivityTracker가 매 초 갱신.
let _pendingSec = 0;
window.workActivity = {
  getPendingSec() { return _pendingSec; },
  setPendingSec(sec) {
    const n = Math.max(0, Math.min(59, Math.floor(Number(sec) || 0)));
    _pendingSec = n;
    window.dispatchEvent(new CustomEvent("work-pending-set", { detail: { sec: n } }));
    window.dispatchEvent(new CustomEvent("work-tick"));
  },
  subscribe(fn) {
    const h = () => fn(_pendingSec);
    window.addEventListener("work-tick", h);
    return () => window.removeEventListener("work-tick", h);
  },
};

// ---- 워크 트래커 (module-level) ----
// 기본 ON — 앱이 실행되어 있기만 하면 무조건 카운트 (외부 환경 기준).
// 사용자가 점을 클릭하면 STOP — 다시 클릭하면 재개.
// (이전엔 visible/focused/idle 체크가 있었으나, 사용자 요청으로 항상 카운트로 단순화.)
(function () {
  let running = true;  // 앱 시작 시 기본 ON
  const subs = new Set();
  window.workTracker = {
    isRunning() { return running; },
    // 방 동기화 코드의 기존 "외부 모드" API와 호환: 현재 단순화된 트래커에서는 running 상태가 곧 외부 작업 상태다.
    isExternal() { return running; },
    setRunning(on) {
      const next = !!on;
      if (next === running) return;
      running = next;
      const act = window.diary && window.diary.actions;
      if (act) {
        if (next) act.startWorkSessionLog();
        else act.endWorkSessionLog();
      }
      for (const fn of subs) fn(running);
    },
    toggle() { this.setRunning(!running); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
})();

// ---- 트래커 ----
// running 일 때 매 초 카운트. STOP 이면 카운트 중지.
function ActivityTracker() {
  const { actions } = diary.useDiary();
  const pendingSecRef = useRef(0);

  useEffect(() => {
    const onReset = () => {
      pendingSecRef.current = 0;
      _pendingSec = 0;
      window.dispatchEvent(new CustomEvent("work-tick"));
    };
    const onPendingSet = (e) => {
      const sec = Math.max(0, Math.min(59, Math.floor(Number(e.detail?.sec) || 0)));
      pendingSecRef.current = sec;
      _pendingSec = sec;
    };
    window.addEventListener("work-minutes-reset", onReset);
    window.addEventListener("work-pending-set", onPendingSet);
    return () => {
      window.removeEventListener("work-minutes-reset", onReset);
      window.removeEventListener("work-pending-set", onPendingSet);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!(window.workTracker && window.workTracker.isRunning())) return;

      pendingSecRef.current += TICK_SEC;
      _pendingSec = pendingSecRef.current;

      // 60초 누적되면 store에 commit
      if (pendingSecRef.current >= 60) {
        const m = Math.floor(pendingSecRef.current / 60);
        pendingSecRef.current = pendingSecRef.current % 60;
        _pendingSec = pendingSecRef.current;
        actions.addWorkMinutes(m);
      }

      // 미니 위젯 등 구독자에게 알림 — 매 초 (running 일 때만)
      window.dispatchEvent(new CustomEvent("work-tick"));
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}

// ---- 자동 일시정지 (유휴 / 창 비활성) ----
function AutoPauseWatcher() {
  const { state } = diary.useDiary();
  const wt = diary.select.workTrackSettings(state);
  const idleMin = wt.autoPauseIdleMin || 0;
  const pauseOnBlur = !!wt.autoPauseOnBlur;

  useEffect(() => {
    if (!idleMin && !pauseOnBlur) return;
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll"];
    events.forEach(ev => window.addEventListener(ev, bump, { passive: true }));

    const onVis = () => {
      if (pauseOnBlur && document.hidden && window.workTracker && window.workTracker.isRunning()) {
        window.workTracker.setRunning(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const id = setInterval(() => {
      if (!idleMin || !(window.workTracker && window.workTracker.isRunning())) return;
      if (Date.now() - lastActivity >= idleMin * 60000) {
        window.workTracker.setRunning(false);
      }
    }, 5000);

    return () => {
      events.forEach(ev => window.removeEventListener(ev, bump));
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, [idleMin, pauseOnBlur]);

  return null;
}

function WorkSessionBootstrap() {
  const { actions } = diary.useDiary();
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    actions.closeOrphanWorkSessionLogs();
    if (window.workTracker && window.workTracker.isRunning()) {
      actions.startWorkSessionLog();
    }
  }, [actions]);
  return null;
}

// ---- 회고 모달 (전역) ----
function RetroModal() {
  useI18n();
  const [open, setOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const { state, actions } = diary.useDiary();
  const today = diary.today();
  const r = diary.select.retroForDate(state, today);
  const minutes = diary.select.workMinutesToday(state);
  const project = diary.select.currentProject(state);
  const doneToday = state.todos.filter(
    t => t.done && t.doneAt === today && t.projectId === state.currentProjectId
  );

  // 전역 핸들러 등록
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-retro-modal", handler);
    return () => window.removeEventListener("open-retro-modal", handler);
  }, []);

  if (!open) return null;

  const save = (patch) => {
    actions.saveRetro({
      date: today,
      text: r?.text ?? "",
      good: r?.good ?? "",
      bad: r?.bad ?? "",
      ...patch,
    });
  };

  const finish = () => {
    // 타이머 정지 (있으면)
    if (state.timer.cycleStartedAt && !state.timer.paused) {
      actions.pauseCycle();
    }
    setOpen(false);
  };

  const runAiDraft = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const bookmarks = state.aiBookmarks
        .filter(b => b.projectId === state.currentProjectId && b.date === today);
      const draft = await window.diaryAI.generateRetroDraft({
        project, minutes, doneTodos: doneToday,
        stuck: diary.select.stuckForCurrent(state),
        bookmarks,
        existingText: r?.text ?? "",
      });
      // 비어있는 칸만 채움 (기존 사용자 입력 보존)
      save({
        text: r?.text?.trim() ? r.text : draft.text,
        good: r?.good?.trim() ? r.good : draft.good,
        bad:  r?.bad?.trim()  ? r.bad  : draft.bad,
      });
    } catch (e) {
      setAiError(e.message || L("common.fail"));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div onClick={() => setOpen(false)} style={{
      position: "fixed", inset: 0,
      background: "rgba(138, 106, 94, 0.35)",
      backdropFilter: "blur(2px)",
      display: "grid", placeItems: "center",
      zIndex: 1000,
      padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="sk-box" style={{
        background: "var(--paper)",
        padding: 0,
        width: "min(440px, 92vw)",
        maxHeight: "90vh",
        overflow: "auto",
        boxShadow: "0 8px 0 var(--paper-3), 0 12px 30px rgba(138,106,94,0.3)",
      }}>
        {/* 헤더 */}
        <div style={{
          background: "var(--pink-soft)",
          padding: "10px 14px",
          borderBottom: "1.1px solid var(--ink)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 9, color: "var(--pink)", letterSpacing: 1 }}>♡ ♡ ♡</span>
          <span style={{ fontFamily: "var(--hand)", fontSize: 15, fontWeight: 700, flex: 1 }}>
            {L("finish.title")}
          </span>
          <button onClick={() => setOpen(false)} className="xp-btn close">×</button>
        </div>

        {/* 본문 */}
        <div style={{ padding: 16 }}>
          <div className="sk-cap">{diary.fmtKDate(today)} · {project?.name ?? L("proj.fallback")}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 8, marginBottom: 14, fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink-2)" }}>
            <span>{L("finish.workMin", { minutes })}</span>
            <span>{L("finish.doneCount", { n: doneToday.length })}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div className="sk-label" style={{ flex: 1 }}>{L("finish.oneLine")}</div>
            <button onClick={runAiDraft} disabled={aiLoading} style={{
              all: "unset", cursor: aiLoading ? "wait" : "pointer",
              padding: "2px 10px", borderRadius: 99,
              border: "1.1px solid var(--ink)",
              background: aiLoading ? "var(--paper-2)" : "var(--lavender-soft)",
              fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)",
            }}>
              {aiLoading ? L("finish.aiThinking") : L("finish.aiDraft")}
            </button>
          </div>
          {aiError && (
            <div className="sk-cap" style={{ color: "var(--bad)", marginBottom: 4 }}>{aiError}</div>
          )}
          <textarea
            value={r?.text ?? ""}
            onChange={(e) => save({ text: e.target.value })}
            placeholder={L("retro.textPh")}
            rows={2}
            autoFocus
            style={modalInput}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div>
              <div className="sk-label" style={{ marginBottom: 6 }}>{L("retro.goodLabel")}</div>
              <textarea
                value={r?.good ?? ""}
                onChange={(e) => save({ good: e.target.value })}
                placeholder={L("retro.optional")}
                rows={2}
                style={modalInput}
              />
            </div>
            <div>
              <div className="sk-label" style={{ marginBottom: 6 }}>{L("retro.badLabel")}</div>
              <textarea
                value={r?.bad ?? ""}
                onChange={(e) => save({ bad: e.target.value })}
                placeholder={L("retro.optional")}
                rows={2}
                style={modalInput}
              />
            </div>
          </div>

          {/* 오늘 완료한 일 미리보기 */}
          {doneToday.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="sk-label" style={{ marginBottom: 6 }}>{L("finish.doneToday")}</div>
              <div className="sk-box" style={{
                padding: 8, background: "var(--paper-2)",
                fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink-2)",
                maxHeight: 100, overflow: "auto",
              }}>
                {doneToday.map(t => (
                  <div key={t.id} style={{ marginBottom: 2 }}>✓ {t.text}</div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
            <button onClick={() => setOpen(false)} style={btn}>{L("finish.closeContinue")}</button>
            <button onClick={finish} style={{ ...btn, background: "var(--mint)" }}>
              {L("finish.finishToday")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- 전역 헬퍼 ----
function openRetroModal() {
  window.dispatchEvent(new CustomEvent("open-retro-modal"));
}

// ---- 스타일 ----
const modalInput = {
  width: "100%", border: "1.1px solid var(--ink-soft)", outline: "none",
  background: "var(--paper)", borderRadius: 8,
  fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink)",
  padding: "6px 8px", resize: "vertical", minHeight: 36,
};
const btn = {
  all: "unset", cursor: "pointer",
  background: "var(--paper)", border: "1.1px solid var(--ink)",
  padding: "5px 14px", borderRadius: 99,
  fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink)",
};

window.ActivityTracker = ActivityTracker;
window.AutoPauseWatcher = AutoPauseWatcher;
window.WorkSessionBootstrap = WorkSessionBootstrap;
window.RetroModal = RetroModal;
window.openRetroModal = openRetroModal;
