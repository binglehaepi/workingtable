/* global React, diary, ViewHeader, Divider, Editable */
// ===========================================================
// 회고 — 날짜별 1개 (오늘 회고 + 지난 회고 목록)
// ===========================================================

function RetroView() {
  const { state, actions } = diary.useDiary();
  const today = diary.today();
  const todayRetro = diary.select.retroForDate(state, today);
  const past = state.retros
    .filter(r => r.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date));

  const save = (patch) => {
    actions.saveRetro({
      date: today,
      text: todayRetro?.text ?? "",
      good: todayRetro?.good ?? "",
      bad: todayRetro?.bad ?? "",
      ...patch,
    });
  };

  return (
    <div>
      {/* 오늘 회고 */}
      <div className="sk-box" style={{ padding: 12, background: "var(--hi-soft)", marginBottom: 16 }}>
        <div className="sk-label">{L("ai.today")}{diary.fmtKDate(today)}</div>
        <div style={{ marginTop: 6 }}>
          <Editable
            value={todayRetro?.text ?? ""}
            onChange={(v) => save({ text: v })}
            placeholder={L("retro.placeholder")}
            multiline
            style={{
              fontFamily: "var(--hand-2)", fontSize: 17, lineHeight: 1.35,
              color: "var(--ink)", minHeight: 40,
            }}
          />
        </div>
        <Divider />
        <div className="sk-label" style={{ marginBottom: 6 }}>{L("retro.good")}</div>
        <Editable
          value={todayRetro?.good ?? ""}
          onChange={(v) => save({ good: v })}
          placeholder={L("retro.goodPlaceholder")}
          multiline
          style={{
            fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink-2)",
            lineHeight: 1.3, marginBottom: 10, minHeight: 20,
          }}
        />
        <div className="sk-label" style={{ marginBottom: 6 }}>{L("retro.bad")}</div>
        <Editable
          value={todayRetro?.bad ?? ""}
          onChange={(v) => save({ bad: v })}
          placeholder={L("retro.badPlaceholder")}
          multiline
          style={{
            fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink-2)",
            lineHeight: 1.3, minHeight: 20,
          }}
        />
      </div>

      {/* 지난 회고 */}
      <div className="sk-label" style={{ marginBottom: 8 }}>{L("retro.past")} · {past.length}</div>
      {past.length === 0 && (
        <div className="sk-cap" style={{ textAlign: "center", padding: 12 }}>
          {L("retro.empty")}
        </div>
      )}
      {past.map(r => (
        <div key={r.id} className="sk-box" style={{ padding: 10, marginBottom: 6, background: "white" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span className="sk-mono" style={{ color: "var(--ink-2)" }}>{diary.fmtKDateShort(r.date)}</span>
            <span className="sk-cap" style={{ fontSize: 13 }}>{diary.fmtKDate(r.date).split(" ")[2] /* (요일) */}</span>
          </div>
          {r.text && (
            <div style={{ fontFamily: "var(--hand-2)", fontSize: 15, color: "var(--ink)", lineHeight: 1.3 }}>
              {r.text}
            </div>
          )}
          {(r.good || r.bad) && (
            <div style={{ marginTop: 6, fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink-2)" }}>
              {r.good && <div>👍 {r.good}</div>}
              {r.bad && <div>👎 {r.bad}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

window.RetroView = RetroView;
