/* global React, diary, L */
// ===========================================================
// 작업 시간 UI — 타이머 바, 미니 위젯, 캘린더 일기에서 공유
// ===========================================================

const { useState, useEffect, useRef } = React;

const pad2 = (n) => String(Math.max(0, Math.floor(n || 0))).padStart(2, "0");

const WORK_TIME_PANEL_W = 268;
const WORK_TIME_PANEL_PAD = 10;

/** 앵커 기준 fixed 위치 — viewport 안으로 좌우 클램프 */
function clampWorkTimePanelStyle(anchorEl, opts = {}) {
  if (!anchorEl) return {};
  const width = opts.width || WORK_TIME_PANEL_W;
  const pad = opts.pad ?? WORK_TIME_PANEL_PAD;
  const gap = opts.gap ?? 8;
  const placement = opts.placement || "below";
  const r = anchorEl.getBoundingClientRect();
  let left = r.left + r.width / 2 - width / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
  const base = {
    position: "fixed",
    left,
    width,
    transform: "none",
    marginTop: 0,
    zIndex: 10000,
  };
  if (placement === "above") {
    return { ...base, top: "auto", bottom: window.innerHeight - r.top + gap };
  }
  return { ...base, top: r.bottom + gap, bottom: "auto" };
}

function fmtClockTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtLogDuration(startTs, endTs) {
  const ms = Math.max(0, (endTs || Date.now()) - startTs);
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function useWorkTimeLive() {
  const { state } = diary.useDiary();
  const wt = diary.select.workTrackSettings(state);
  const editDate = diary.today();
  const minutes = diary.select.workMinutesForDate(state, editDate);
  const [pendingSec, setPendingSec] = useState(() => (
    window.workActivity ? window.workActivity.getPendingSec() : 0
  ));
  const [running, setRunning] = useState(() => !!(window.workTracker && window.workTracker.isRunning()));

  useEffect(() => {
    if (!window.workTracker) return;
    return window.workTracker.subscribe(setRunning);
  }, []);
  useEffect(() => {
    if (!window.workActivity) return;
    return window.workActivity.subscribe(setPendingSec);
  }, []);

  const totalSec = minutes * 60 + (editDate === diary.today() ? pendingSec : 0);
  const goalMin = wt.dailyGoalMin || 0;
  const goalPct = goalMin > 0 ? Math.min(100, Math.round((totalSec / 60 / goalMin) * 100)) : null;

  return { state, wt, minutes, pendingSec, running, totalSec, goalMin, goalPct, editDate };
}

const wtStepBtn = {
  width: 22, height: 22, borderRadius: 6, padding: 0, margin: 0,
  border: "1.1px solid var(--ink-soft)", background: "var(--paper)",
  display: "grid", placeItems: "center", boxSizing: "border-box",
  fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--ink)",
  lineHeight: 1, cursor: "pointer", userSelect: "none",
};

function WorkNumStepper({ value, onChange, min = 0, max = 99 }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef(null);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);
  const commit = () => {
    const n = parseInt(String(draft).trim(), 10);
    if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
    setEditing(false);
  };
  const atMin = value <= min;
  const atMax = value >= max;
  const box = {
    minWidth: 28, textAlign: "center", fontSize: 12, fontWeight: 700,
    padding: "2px 0", borderRadius: 6, fontFamily: "var(--mono)", color: "var(--ink)",
    background: "var(--paper-2)", border: "1px solid var(--paper-3)",
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }} onMouseDown={e => e.stopPropagation()}>
      <button type="button" disabled={atMin} onClick={() => !atMin && onChange(value - 1)}
        style={{ ...wtStepBtn, opacity: atMin ? 0.35 : 1, cursor: atMin ? "default" : "pointer" }}>−</button>
      {editing ? (
        <input ref={inputRef} type="number" min={min} max={max} value={draft}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); setDraft(String(value)); setEditing(false); }
          }}
          style={{ ...box, width: 36, outline: "none", border: "1.1px solid var(--ink)" }}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} style={{ ...box, cursor: "pointer" }}>{value}</button>
      )}
      <button type="button" disabled={atMax} onClick={() => !atMax && onChange(value + 1)}
        style={{ ...wtStepBtn, opacity: atMax ? 0.35 : 1, cursor: atMax ? "default" : "pointer" }}>+</button>
    </div>
  );
}

function WorkOnOff({ on, onClick }) {
  return (
    <div style={{
      display: "inline-flex", borderRadius: 99,
      border: "1.1px solid var(--ink)", overflow: "hidden", flexShrink: 0,
    }}>
      {[true, false].map((v, i) => (
        <button key={String(v)} type="button" onClick={() => onClick(v)} style={{
          all: "unset", cursor: "pointer",
          padding: "3px 8px", minWidth: 32, textAlign: "center",
          borderLeft: i ? "1.1px solid var(--ink)" : "none",
          background: on === v ? "var(--mint)" : "var(--paper)",
          fontFamily: "var(--hand)", fontSize: 10, fontWeight: on === v ? 700 : 400,
          color: "var(--ink)", lineHeight: 1.2,
        }}>{v ? L("set.on") : L("set.off")}</button>
      ))}
    </div>
  );
}

function WorkTimeDisplayParts({ totalSec, showSeconds }) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const unit = (lbl) => (
    <span style={{ fontSize: 10, opacity: 0.6 }}>{lbl}</span>
  );
  if (showSeconds) {
    return (
      <>
        <span>{pad2(h)}</span>{unit("H")}
        <span>{pad2(m)}</span>{unit("M")}
        <span>{pad2(s)}</span>{unit("S")}
      </>
    );
  }
  return (
    <>
      <span>{pad2(h)}</span>{unit("H")}
      <span>{pad2(m)}</span>{unit("M")}
    </>
  );
}

function WorkGoalBar({ goalPct, goalMin }) {
  if (!goalMin || goalPct == null) return null;
  return (
    <span style={{
      fontSize: 9, fontFamily: "var(--mono)", color: "var(--ink-2)",
      background: "var(--paper-2)", padding: "0 5px", borderRadius: 99,
      border: "1px solid var(--paper-3)", flexShrink: 0,
    }} title={L("worktrack.goalTip", { n: goalMin })}>{goalPct}%</span>
  );
}

function WorkTimeTabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: "flex", borderRadius: 8,
      border: "1.1px solid var(--ink-soft)", overflow: "hidden",
      marginBottom: 10,
    }}>
      {tabs.map(([id, lbl], i) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          style={{
            all: "unset", cursor: "pointer", flex: 1,
            padding: "6px 2px", textAlign: "center",
            borderLeft: i ? "1.1px solid var(--ink-soft)" : "none",
            background: active === id ? "var(--hi)" : "var(--paper)",
            fontFamily: "var(--hand)", fontSize: 11,
            fontWeight: active === id ? 700 : 500,
            color: "var(--ink)", lineHeight: 1.2,
          }}
        >{lbl}</button>
      ))}
    </div>
  );
}

function WorkTimeSettingsPanel({
  editDate: editDateProp,
  onEditDateChange,
  minutes,
  pendingSec = 0,
  running = false,
  onToggleRunning,
  onClose,
  actions,
  state,
  showDatePicker = false,
  showTracking = true,
  showPending = true,
  showOptions = true,
  showLogs = true,
  showPresets = true,
  panelStyle = {},
}) {
  const editDate = editDateProp || diary.today();
  const isToday = editDate === diary.today();
  const wt = diary.select.workTrackSettings(state);
  const totalMin = diary.select.workMinutesForDate(state, editDate);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const byProjectRaw = diary.select.workByProjectForDate(state, editDate);
  const curProj = diary.select.currentProject(state);
  const hasCur = byProjectRaw.some(r => r.projectId === (state.currentProjectId ?? null));
  const byProject = hasCur || !curProj ? byProjectRaw : [
    ...byProjectRaw,
    { projectId: state.currentProjectId, project: curProj, minutes: 0 },
  ];
  const logs = diary.select.workSessionLogsForDate(state, editDate);
  const totalSec = totalMin * 60 + (isToday ? pendingSec : 0);
  const goalPct = wt.dailyGoalMin > 0
    ? Math.min(100, Math.round((totalSec / 60 / wt.dailyGoalMin) * 100))
    : null;

  const tabDefs = [
    ["time", L("worktrack.tabTime")],
    ["project", L("worktrack.tabProject")],
  ];
  if (showOptions) tabDefs.push(["prefs", L("worktrack.tabPrefs")]);
  const [tab, setTab] = useState(tabDefs[0][0]);

  useEffect(() => {
    if (!tabDefs.some(([id]) => id === tab)) setTab(tabDefs[0][0]);
  }, [showOptions]);

  const setTotalMinutes = (nextH, nextM) => {
    actions.setWorkMinutes(Math.max(0, nextH * 60 + nextM), editDate);
  };

  const resetWork = async () => {
    const msg = isToday ? L("worktrack.resetConfirm") : L("worktrack.resetConfirmDate", { d: editDate });
    const ok = await (window.dialog
      ? window.dialog.confirm(msg)
      : Promise.resolve(window.confirm(msg)));
    if (ok) {
      actions.resetWorkMinutes(editDate);
      if (isToday && window.workActivity) window.workActivity.setPendingSec(0);
    }
  };

  const presetBtn = {
    all: "unset", cursor: "pointer",
    padding: "3px 8px", borderRadius: 99,
    border: "1.1px solid var(--ink-soft)", background: "var(--paper-2)",
    fontFamily: "var(--hand)", fontSize: 10, fontWeight: 600, color: "var(--ink-2)",
  };

  const rowLabel = {
    fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink)",
  };

  const tabTime = (
    <>
      {showDatePicker && (
        <div style={{ marginBottom: 10 }}>
          <div className="sk-cap" style={{ marginBottom: 4, fontSize: 10 }}>{L("worktrack.editDate")}</div>
          <input type="date" value={editDate} max={diary.today()}
            onChange={(e) => {
              const v = e.target.value;
              if (v && v <= diary.today() && onEditDateChange) onEditDateChange(v);
            }}
            style={{
              width: "100%", boxSizing: "border-box",
              border: "1.1px solid var(--ink)", borderRadius: 6, padding: "4px 6px",
              fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink)", outline: "none",
            }}
          />
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <div className="sk-cap" style={{ marginBottom: 5, fontSize: 10 }}>{L("worktrack.accumulated")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <WorkNumStepper value={h} min={0} max={99} onChange={v => setTotalMinutes(v, m)} />
          <span style={{ fontSize: 10, opacity: 0.6, fontFamily: "var(--mono)" }}>H</span>
          <WorkNumStepper value={m} min={0} max={59} onChange={v => setTotalMinutes(h, v)} />
          <span style={{ fontSize: 10, opacity: 0.6, fontFamily: "var(--mono)" }}>M</span>
          {goalPct != null && (
            <span style={{ marginLeft: 4, fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink-2)" }}>
              · {goalPct}%
            </span>
          )}
        </div>
      </div>

      {showPending && isToday && (
        <div style={{ marginBottom: 10 }}>
          <div className="sk-cap" style={{ marginBottom: 5, fontSize: 10 }}>{L("worktrack.pendingSec")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <WorkNumStepper value={pendingSec} min={0} max={59}
              onChange={v => { if (window.workActivity) window.workActivity.setPendingSec(v); }}
            />
            <span style={{ fontSize: 10, opacity: 0.6, fontFamily: "var(--mono)" }}>S</span>
          </div>
          <div className="sk-cap" style={{ marginTop: 4, fontSize: 9.5, lineHeight: 1.35, color: "var(--ink-3)" }}>
            {L("worktrack.pendingHint")}
          </div>
        </div>
      )}

      {showPresets && isToday && (
        <div>
          <div className="sk-cap" style={{ marginBottom: 5, fontSize: 10 }}>{L("worktrack.presets")}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[[15, "+15m"], [30, "+30m"], [60, "+1h"]].map(([min, lbl]) => (
              <button key={min} type="button" style={presetBtn}
                onClick={() => actions.addWorkMinutes(min)}>{lbl}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const tabProject = byProject.length > 0 ? (
    <div style={{
      borderRadius: 8, border: "1px solid var(--paper-3)", overflow: "hidden",
    }}>
      {byProject.map((row, i) => {
        const ph = Math.floor(row.minutes / 60);
        const pm = row.minutes % 60;
        return (
          <div key={String(row.projectId)} style={{
            padding: "6px 8px",
            borderBottom: i < byProject.length - 1 ? "1px solid var(--paper-3)" : "none",
          }}>
            <div style={{
              fontFamily: "var(--hand)", fontSize: 11, fontWeight: 600,
              marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{row.project?.name ?? L("worktrack.unclassified")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              <WorkNumStepper value={ph} min={0} max={99}
                onChange={v => actions.setWorkMinutesForProject(v * 60 + pm, editDate, row.projectId)} />
              <span style={{ fontSize: 9, opacity: 0.5 }}>H</span>
              <WorkNumStepper value={pm} min={0} max={59}
                onChange={v => actions.setWorkMinutesForProject(ph * 60 + v, editDate, row.projectId)} />
              <span style={{ fontSize: 9, opacity: 0.5 }}>M</span>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div className="sk-cap" style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "center", padding: "16px 8px" }}>
      {L("worktrack.noProjects")}
    </div>
  );

  const tabPrefs = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {showTracking && isToday && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          paddingBottom: 8, borderBottom: "1px solid var(--paper-3)",
        }}>
          <span style={{ ...rowLabel, fontWeight: 600 }}>{L("worktrack.tracking")}</span>
          <WorkOnOff on={running} onClick={onToggleRunning} />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={rowLabel}>{L("worktrack.showSeconds")}</span>
        <WorkOnOff on={!!wt.showSeconds} onClick={v => actions.setWorkTrackSettings({ showSeconds: v })} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={rowLabel}>{L("worktrack.dailyGoal")}</span>
        <WorkNumStepper value={wt.dailyGoalMin || 0} min={0} max={720}
          onChange={v => actions.setWorkTrackSettings({ dailyGoalMin: v })} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={rowLabel}>{L("worktrack.autoPauseBlur")}</span>
        <WorkOnOff on={!!wt.autoPauseOnBlur} onClick={v => actions.setWorkTrackSettings({ autoPauseOnBlur: v })} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={rowLabel}>{L("worktrack.autoPauseIdle")}</span>
        <WorkNumStepper value={wt.autoPauseIdleMin || 0} min={0} max={120}
          onChange={v => actions.setWorkTrackSettings({ autoPauseIdleMin: v })} />
      </div>
      {wt.autoPauseIdleMin > 0 && (
        <div className="sk-cap" style={{ fontSize: 9.5, color: "var(--ink-3)", lineHeight: 1.35 }}>
          {L("worktrack.autoPauseIdleHint")}
        </div>
      )}

      {showLogs && (
        <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--paper-3)" }}>
          <div className="sk-cap" style={{ marginBottom: 5, fontSize: 10 }}>{L("worktrack.sessionLogs")}</div>
          {logs.length > 0 ? (
            <div style={{
              maxHeight: 88, overflowY: "auto",
              borderRadius: 8, border: "1px solid var(--paper-3)", background: "var(--paper-2)",
              padding: "4px 8px", fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)",
            }}>
              {logs.map(log => (
                <div key={log.id} style={{ marginBottom: 2 }}>
                  {fmtClockTs(log.startTs)}–{log.endTs ? fmtClockTs(log.endTs) : "…"}
                  {" · "}{fmtLogDuration(log.startTs, log.endTs)}
                </div>
              ))}
            </div>
          ) : (
            <div className="sk-cap" style={{ fontSize: 10, color: "var(--ink-3)" }}>{L("worktrack.noSessions")}</div>
          )}
        </div>
      )}
    </div>
  );

  const tabContent = tab === "project" ? tabProject : tab === "prefs" ? tabPrefs : tabTime;

  return (
    <div className="sk-box work-time-panel" style={{
      padding: 10,
      background: "var(--paper)", boxShadow: "0 4px 0 var(--paper-3)",
      display: "flex", flexDirection: "column",
      maxHeight: "min(380px, 72vh)",
      boxSizing: "border-box",
      ...panelStyle,
    }} onMouseDown={e => e.stopPropagation()}>
      <div className="sk-label" style={{ marginBottom: 8, flexShrink: 0 }}>{L("worktrack.settingsTitle")}</div>

      {tabDefs.length > 1 && (
        <WorkTimeTabBar tabs={tabDefs} active={tab} onChange={setTab} />
      )}

      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
        marginBottom: 10,
      }}>
        {tabContent}
      </div>

      <div style={{
        display: "flex", gap: 6, justifyContent: "flex-end",
        flexShrink: 0, paddingTop: 8, borderTop: "1px solid var(--paper-3)",
      }}>
        <button type="button" onClick={resetWork} style={{
          all: "unset", cursor: "pointer",
          fontFamily: "var(--hand)", fontSize: 11, color: "var(--bad)",
          padding: "2px 4px",
        }}>{L("worktrack.resetBtn")}</button>
        <button type="button" onClick={onClose} style={{
          all: "unset", cursor: "pointer",
          padding: "3px 10px", borderRadius: 99,
          border: "1.1px solid var(--ink)", background: "var(--paper-2)",
          fontFamily: "var(--hand)", fontSize: 11, fontWeight: 600, color: "var(--ink)",
        }}>{L("todo.close")}</button>
      </div>
    </div>
  );
}

function WorkTimeChip({
  compact = false,
  editDate: editDateProp,
  showStatus = true,
  showSettings = true,
  panelStyle,
}) {
  const { state, actions } = diary.useDiary();
  const [editDate, setEditDate] = useState(editDateProp || diary.today());
  useEffect(() => { if (editDateProp) setEditDate(editDateProp); }, [editDateProp]);
  const wt = diary.select.workTrackSettings(state);
  const minutes = diary.select.workMinutesForDate(state, editDate);
  const isToday = editDate === diary.today();
  const [hover, setHover] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pendingSec, setPendingSec] = useState(() => (
    window.workActivity ? window.workActivity.getPendingSec() : 0
  ));
  const [running, setRunning] = useState(() => !!(window.workTracker && window.workTracker.isRunning()));
  const wrapRef = useRef(null);
  const [panelFixedStyle, setPanelFixedStyle] = useState(null);

  const syncPanelPos = () => {
    if (!wrapRef.current) return;
    setPanelFixedStyle(clampWorkTimePanelStyle(wrapRef.current, { width: WORK_TIME_PANEL_W }));
  };

  useEffect(() => {
    if (!window.workTracker) return;
    return window.workTracker.subscribe(setRunning);
  }, []);
  useEffect(() => {
    if (!window.workActivity) return;
    return window.workActivity.subscribe(setPendingSec);
  }, []);
  useEffect(() => {
    if (!panelOpen) {
      setPanelFixedStyle(null);
      return;
    }
    syncPanelPos();
    const onReflow = () => syncPanelPos();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [panelOpen]);
  useEffect(() => {
    if (!panelOpen) return;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setPanelOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [panelOpen]);

  const totalSec = minutes * 60 + (isToday ? pendingSec : 0);
  const goalPct = wt.dailyGoalMin > 0
    ? Math.min(100, Math.round((totalSec / 60 / wt.dailyGoalMin) * 100))
    : null;

  const toggleRunning = (on) => {
    if (!window.workTracker) return;
    window.workTracker.setRunning(!!on);
  };

  const dotColor = running ? "#ff3b3b" : "#1f1f1f";
  const label = running ? L("worktrack.runningOn") : L("worktrack.runningOff");
  const fs = compact ? 13 : 15;

  return (
    <span
      ref={wrapRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: compact ? 3 : 4,
        fontFamily: "var(--mono)", fontWeight: 700, fontSize: fs, color: "var(--ink)",
      }}
    >
      {showStatus && isToday && (
        <>
          <button onClick={() => toggleRunning(!running)} title={label} style={{
            all: "unset", cursor: "pointer", flexShrink: 0,
            width: 7, height: 7, borderRadius: "50%",
            background: dotColor,
            boxShadow: running ? "0 0 4px rgba(255,59,59,0.55)" : "none",
            animation: running ? "wt-blink 1.1s ease-in-out infinite" : "none",
            transition: "background .15s",
          }} />
          {!compact && (
            <span style={{ fontSize: 9.5, letterSpacing: 1, color: running ? "#b03030" : "var(--ink-2)" }}>
              {running ? "WORKING" : "STOPPED"}
            </span>
          )}
        </>
      )}
      <WorkTimeDisplayParts totalSec={totalSec} showSeconds={!!wt.showSeconds} />
      {goalPct != null && <WorkGoalBar goalPct={goalPct} goalMin={wt.dailyGoalMin} />}
      {showSettings && (
        <button
          onClick={(e) => { e.stopPropagation(); setPanelOpen(o => !o); }}
          title={L("worktrack.settingsTip")}
          aria-label={L("worktrack.settingsTip")}
          style={{
            all: "unset", cursor: "pointer", flexShrink: 0,
            marginLeft: 2,
            width: compact ? 14 : 16, height: compact ? 14 : 16, borderRadius: "50%",
            display: "grid", placeItems: "center",
            fontSize: compact ? 9 : 10, fontWeight: 700, lineHeight: 1,
            color: panelOpen ? "var(--ink)" : "var(--ink-2)",
            background: panelOpen ? "var(--paper-2)" : "transparent",
            border: panelOpen ? "1px solid var(--ink-soft)" : "1px solid transparent",
            opacity: (hover || panelOpen) ? 0.9 : 0,
            pointerEvents: (hover || panelOpen) ? "auto" : "none",
            transition: "opacity 0.15s, background 0.15s",
          }}
        >⚙</button>
      )}

      {panelOpen && panelFixedStyle && (
        <WorkTimeSettingsPanel
          editDate={editDate}
          minutes={minutes}
          pendingSec={pendingSec}
          running={running}
          onToggleRunning={toggleRunning}
          onClose={() => setPanelOpen(false)}
          actions={actions}
          state={state}
          showDatePicker={!editDateProp}
          onEditDateChange={setEditDate}
          panelStyle={{ ...panelStyle, ...panelFixedStyle }}
        />
      )}
    </span>
  );
}

window.WorkTimeUI = {
  WorkTimeChip,
  WorkTimeSettingsPanel,
  WorkTimeDisplayParts,
  WorkGoalBar,
  useWorkTimeLive,
  fmtClockTs,
  pad2,
  clampWorkTimePanelStyle,
  WORK_TIME_PANEL_W,
};

const DOCK_MINI_H = 78;
function getDockMiniSize(showSeconds) {
  return { w: showSeconds ? 168 : 148, h: DOCK_MINI_H };
}
function readDockMiniSize() {
  try {
    const st = diary.getState();
    const wt = diary.select.workTrackSettings(st);
    return getDockMiniSize(!!wt.showSeconds);
  } catch (_) {
    return getDockMiniSize(false);
  }
}
window.TODOARY_DOCK_MINI = { getSize: readDockMiniSize, getDockMiniSize, H: DOCK_MINI_H };

if (!document.getElementById("work-time-ui-css")) {
  const s = document.createElement("style");
  s.id = "work-time-ui-css";
  s.textContent = `
    .work-time-panel {
      scrollbar-width: thin;
      scrollbar-color: var(--ink-soft) transparent;
    }
    .work-time-panel::-webkit-scrollbar { width: 4px; }
    .work-time-panel::-webkit-scrollbar-thumb {
      background: var(--ink-soft);
      border-radius: 99px;
    }
  `;
  document.head.appendChild(s);
}
