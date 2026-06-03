/* global React, diary, SplitPane, Editable, DelBtn, useI18n, L */
// ===========================================================
// 명령어 — 위: 주로 쓰는 명령어(사용 많은 순) / 아래: 등록한 명령어(전체)
// 클릭 한 번에 복사. 프로젝트별 분리. 사용 횟수 자동 카운트.
// ===========================================================
const { useState } = React;

function CheatView() {
  useI18n();
  const { state, actions } = diary.useDiary();
  const commands = diary.select.commandsForCurrent(state);

  const [copiedId, setCopiedId] = useState(null);
  const onCopy = (id) => {
    actions.copyCommand(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1200);
  };

  // 주로 쓰는 것: 사용 횟수 1회 이상, 많은 순
  const frequent = commands
    .filter(c => (c.uses ?? 0) > 0)
    .slice()
    .sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))
    .slice(0, 6);

  // 등록한 것: 전체 (최근 등록 순 — 스토어가 앞에 추가)
  const all = commands;

  return (
    <SplitPane
      topLabel={`${L("cheat.registered")} · ${all.length}`}
      top={
        <>
          <div style={{ marginBottom: 8 }}>
            <InlineAdd placeholder={L("cheat.add")} onAdd={(v) => actions.addCommand({ code: v })} />
          </div>
          {all.length
            ? all.map((c, i) => <CmdCard key={c.id} c={c} actions={actions} copiedId={copiedId} onCopy={onCopy} i={i} />)
            : <div className="sk-cap">{L("cheat.emptyReg")}</div>}
        </>
      }
      bottomLabel={`${L("cheat.frequent")} · ${frequent.length}`}
      bottom={
        frequent.length
          ? frequent.map((c, i) => <CmdCard key={c.id} c={c} actions={actions} copiedId={copiedId} onCopy={onCopy} i={i} compact />)
          : <div className="sk-cap">{L("cheat.emptyFreq")}</div>
      }
    />
  );
}

function CmdCard({ c, actions, copiedId, onCopy, compact, i = 0 }) {
  return (
    <div className="tape" style={{
      ...tapeStyle(i), padding: "7px 15px", marginBottom: 7,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ color: "var(--ink-3)", flexShrink: 0, fontFamily: "var(--mono)", fontSize: 12 }}>❯</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {compact ? (
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.code}</div>
        ) : (
          <Editable
            value={c.code}
            onChange={(v) => actions.updateCommand(c.id, { code: v })}
            style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)" }}
          />
        )}
        {(c.label || !compact) && (
          compact
            ? (c.label && <div style={{ fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink-2)" }}>{c.label}</div>)
            : <Editable
                value={c.label}
                onChange={(v) => actions.updateCommand(c.id, { label: v })}
                placeholder={L("cheat.label")}
                style={{ fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink-2)" }}
              />
        )}
      </span>
      <span className="sk-cap" style={{ fontSize: 11, flexShrink: 0 }}>{L("cheat.uses", { n: c.uses ?? 0 })}</span>
      <button onClick={() => onCopy(c.id)} title={L("common.copy")} style={{
        all: "unset", cursor: "pointer", fontSize: 13, flexShrink: 0,
        color: copiedId === c.id ? "var(--ink)" : "var(--ink-2)",
      }}>{copiedId === c.id ? "✓" : "📋"}</button>
      {!compact && (
        <DelBtn onClick={() => {
          if (confirm(L("cheat.delConfirm", { x: c.label || c.code }))) actions.removeCommand(c.id);
        }} />
      )}
    </div>
  );
}

window.CheatView = CheatView;
