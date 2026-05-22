/* global React, diary, ViewHeader, Editable, DelBtn */
// ===========================================================
// 프롬프트 함 — 추가 / 복사(사용횟수↑) / 수정 / 삭제 / 검색
// ===========================================================
const { useState } = React;

function PromptView() {
  const { state, actions } = diary.useDiary();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const filtered = state.prompts
    .filter(p => !q.trim() || p.text.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0));

  const onCopy = (id) => {
    actions.copyPrompt(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1200);
  };

  return (
    <div>
      {/* 검색 */}
      <div className="sk-box sk-dashed" style={{
        padding: "6px 10px", marginBottom: 10,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span className="sk-cap" style={{ fontSize: 14 }}>🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={L("prompt.search")}
          style={{
            flex: 1, border: 0, outline: "none", background: "transparent",
            fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink)",
          }} />
      </div>

      {/* 추가 */}
      {!adding ? (
        <button onClick={() => setAdding(true)} className="sk-box sk-dashed" style={{
          all: "unset", cursor: "pointer", display: "block", width: "100%",
          padding: "8px 10px", marginBottom: 12, textAlign: "left",
          background: "var(--paper)", borderRadius: 10,
          border: "1.1px dashed var(--ink-2)",
          fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink-2)",
        }}>{L("prompt.add")}</button>
      ) : (
        <div className="sk-box" style={{ padding: 10, marginBottom: 12, background: "var(--paper-2)" }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={L("prompt.bodyPlaceholder")} rows={3}
            style={{
              width: "100%", border: 0, outline: "none", background: "transparent",
              fontFamily: "var(--hand-2)", fontSize: 15, color: "var(--ink)",
              resize: "vertical", minHeight: 48,
            }} />
          <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
            <button onClick={() => { setDraft(""); setAdding(false); }} style={btn}>{L("common.cancel")}</button>
            <button onClick={() => {
              if (draft.trim()) { actions.addPrompt(draft); setDraft(""); setAdding(false); }
            }} style={{...btn, background: "var(--pink)"}}>{L("common.save")}</button>
          </div>
        </div>
      )}

      {/* 리스트 */}
      {filtered.length === 0 && (
        <div className="sk-cap" style={{ textAlign: "center", padding: 20 }}>
          {q ? L("prompt.noResults") : L("prompt.empty")}
        </div>
      )}
      {filtered.map((p, i) => (
        <div key={p.id} className="sk-box" style={{ padding: 10, marginBottom: 8, background: "white" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span className="sk-mono" style={{ color: "var(--ink-3)" }}>#{i+1}</span>
            <span className="sk-cap" style={{ marginLeft: "auto", fontSize: 13 }}>
              {L("prompt.uses", { n: p.uses ?? 0 })}
            </span>
            <DelBtn onClick={() => {
              if (confirm(L("prompt.delConfirm"))) actions.removePrompt(p.id);
            }} />
          </div>
          <div style={{ fontFamily: "var(--hand-2)", fontSize: 16, lineHeight: 1.3 }}>
            <Editable
              value={p.text}
              onChange={(v) => actions.updatePrompt(p.id, v)}
              placeholder={L("prompt.bodyHint")}
              multiline
              style={{ fontFamily: "var(--hand-2)", fontSize: 16, color: "var(--ink)", lineHeight: 1.3 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={() => onCopy(p.id)} style={{
              ...btn,
              background: copiedId === p.id ? "var(--mint)" : "var(--pink)",
            }}>
              {copiedId === p.id ? L("prompt.copied") : L("prompt.copy")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const btn = {
  all: "unset", cursor: "pointer",
  background: "var(--paper)", border: "1.1px solid var(--ink)",
  padding: "2px 10px", borderRadius: 99,
  fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
};

window.PromptView = PromptView;
