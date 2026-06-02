/* global React, diary, DelBtn, openExternalUrl */
// ===========================================================
// 메일함 — 위/아래 2:1 분할
//   1번째 화면 (목록): 위 = 받은 메일 붙여넣기 + 메일 목록 / 아래 = 빠른 답장 프리셋 관리
//   2번째 화면 (메일 클릭): 위 = 메일 본문 보기 / 아래 = 초안 적기 + 프리셋 칩 (클릭 시 초안에 적용)
// ===========================================================
const { useState, useRef, useEffect } = React;

function MailView() {
  const { state, actions } = diary.useDiary();
  const mails = state.emails ?? [];
  const presets = state.replyPresets ?? [];
  const unreplied = mails.filter(m => !m.replied);
  const replied = mails.filter(m => m.replied);
  const [selId, setSelId] = useState(null);
  const [paste, setPaste] = useState("");

  const selected = mails.find(m => m.id === selId) || null;

  function addPasted() {
    const body = paste.trim();
    if (!body) return;
    actions.addInquiry({ subject: body.split("\n")[0].slice(0, 60), body });
    setPaste("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 위 2/3 — 목록 또는 메일 본문 */}
      <div style={{ flex: 2, minHeight: 0, overflowY: "auto", padding: "12px 14px 8px" }}>
        {selected
          ? <MailDetail m={selected} actions={actions} onBack={() => setSelId(null)} />
          : (
            <MailList
              unreplied={unreplied}
              replied={replied}
              total={mails.length}
              paste={paste}
              setPaste={setPaste}
              addPasted={addPasted}
              onPick={(id) => setSelId(id)}
              actions={actions}
            />
          )}
      </div>

      {/* 가로선 */}
      <div style={{ borderTop: "1.6px solid var(--ink)", flexShrink: 0 }} />

      {/* 아래 1/3 — 프리셋 관리 또는 초안 작성 */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "8px 14px 12px" }}>
        {selected
          ? <DraftEditor m={selected} actions={actions} presets={presets} />
          : <PresetsList presets={presets} actions={actions} />}
      </div>
    </div>
  );
}

// ---- 1번째 화면 위 — 목록 ----
function MailList({ unreplied, replied, total, paste, setPaste, addPasted, onPick, actions }) {
  return (
    <>
      <div className="sk-label" style={{ marginBottom: 6 }}>{L("mail.received")} · {unreplied.length}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <textarea
          value={paste}
          onChange={e => setPaste(e.target.value)}
          placeholder={L("mail.paste")}
          rows={1}
          style={{
            flex: 1, boxSizing: "border-box", resize: "vertical", minHeight: 30,
            border: "1.1px solid var(--ink-soft)", borderRadius: 8, outline: "none",
            background: "var(--paper)", padding: "5px 8px",
            fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink)",
          }}
        />
        <button onClick={addPasted} style={{ ...mailBtn, background: "var(--pink)", flexShrink: 0 }}>{L("mail.add")}</button>
      </div>

      {unreplied.map(m => <InquiryRow key={m.id} m={m} onPick={() => onPick(m.id)} actions={actions} />)}
      {replied.length > 0 && (
        <>
          <div className="sk-cap" style={{ margin: "8px 0 4px" }}>{L("mail.replied")} · {replied.length}</div>
          {replied.map(m => <InquiryRow key={m.id} m={m} onPick={() => onPick(m.id)} actions={actions} />)}
        </>
      )}
      {total === 0 && <div className="sk-cap">{L("mail.emptyTop")}</div>}
    </>
  );
}

function InquiryRow({ m, onPick, actions }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", marginBottom: 6,
      borderRadius: 8, border: "1.1px solid var(--ink)",
      background: m.replied ? "var(--paper-2)" : "white",
      opacity: m.replied ? 0.85 : 1,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{m.replied ? "📭" : "✉️"}</span>
      <button onClick={onPick} style={{
        all: "unset", cursor: "pointer", flex: 1, minWidth: 0,
        fontFamily: "var(--hand)", fontSize: 14, fontWeight: m.replied ? 400 : 700,
        color: m.replied ? "var(--ink-2)" : "var(--ink)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{m.subject || m.body?.slice(0, 40) || L("mail.noTitle")}</button>
      <button onClick={() => actions.toggleReplied(m.id)}
        className={"sk-check" + (m.replied ? " done" : "")}
        style={{ cursor: "pointer", flexShrink: 0 }}
        title={m.replied ? L("mail.markUnread") : L("mail.markRepliedTip")} />
      <DelBtn onClick={() => actions.removeEmail(m.id)} />
    </div>
  );
}

// ---- 2번째 화면 위 — 메일 본문 ----
function MailDetail({ m, actions, onBack }) {
  const dateStr = m.createdAt || "";
  const tm = m.ts ? new Date(m.ts).toTimeString().slice(0, 5) : "";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <button onClick={onBack} title={L("mail.back")} style={{
          all: "unset", cursor: "pointer",
          padding: "2px 9px", borderRadius: 99,
          border: "1.1px solid var(--ink)", background: "var(--paper)",
          fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)",
        }}>← {L("mail.back")}</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => actions.toggleReplied(m.id)} style={{
          ...mailBtn, padding: "3px 10px", fontSize: 12,
          background: m.replied ? "var(--mint)" : "var(--paper)",
        }}>{m.replied ? L("mail.replied") : L("mail.markReplied")}</button>
        <DelBtn onClick={() => { actions.removeEmail(m.id); onBack(); }} />
      </div>

      <div style={{
        border: "1.1px solid var(--ink)", borderRadius: 8,
        background: "#ffffff", overflow: "hidden",
      }}>
        <div style={{
          padding: "7px 10px",
          background: "linear-gradient(180deg, color-mix(in srgb, var(--chrome,#a9cdf5) 38%, white) 0%, color-mix(in srgb, var(--chrome,#a9cdf5) 10%, white) 100%)",
          borderBottom: "1px solid var(--ink-soft)",
        }}>
          <div style={{
            fontFamily: "var(--hand)", fontSize: 14, fontWeight: 700, color: "var(--ink)",
            wordBreak: "break-word",
          }}>{m.subject || L("mail.noTitle")}</div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-2)",
            marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap",
          }}>
            <span>👤 {m.who || L("mail.inquiry")}</span>
            {dateStr && <span>📅 {dateStr}{tm ? ` ${tm}` : ""}</span>}
          </div>
        </div>
        <div style={{
          padding: "10px 12px",
          fontFamily: "var(--hand)", fontSize: 13, color: "#222", lineHeight: 1.55,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {m.body || m.preview || <span style={{ color: "var(--ink-3)" }}>{L("mail.noBody")}</span>}
        </div>
      </div>
    </div>
  );
}

// ---- 2번째 화면 아래 — 초안 + 프리셋 칩 ----
function copyText(text) {
  if (!text || !String(text).trim()) return;
  const value = String(text);
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
  };
  try {
    const p = navigator.clipboard && navigator.clipboard.writeText(value);
    if (p && p.catch) p.catch(fallback);
    else fallback();
  } catch (_) {
    fallback();
  }
}

function DraftEditor({ m, actions, presets }) {
  async function openPlatform() {
    let url = m.platformUrl;
    if (!url) {
      url = (await window.dialog.prompt(L("mail.sitePrompt"))) || "";
      if (!url.trim()) return;
      actions.updateEmail(m.id, { platformUrl: url.trim() });
      url = url.trim();
    }
    openExternalUrl(url);
  }
  function copyDraft() {
    const text = m.draft ?? "";
    copyText(text);
  }
  function applyPreset(p) {
    actions.updateEmail(m.id, { draft: p.text });
    copyText(p.text);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 헤더 + 도구 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexShrink: 0 }}>
        <span className="sk-label" style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          ✍️ {L("mail.draftLabel")}
        </span>
        <button onClick={copyDraft} title={L("mail.copyDraft")} style={{
          ...mailBtn, padding: "3px 9px", fontSize: 11.5,
        }}>📋</button>
        <button onClick={openPlatform} title={m.platformUrl || L("mail.siteConnect")} style={{
          ...mailBtn, padding: "3px 9px", fontSize: 11.5,
          background: m.platformUrl ? "var(--point)" : "var(--paper)",
        }}>📧</button>
      </div>

      {/* 프리셋 칩 가로 스크롤 */}
      {presets.length > 0 && (
        <div style={{
          display: "flex", gap: 5, marginBottom: 5,
          overflowX: "auto", flexShrink: 0,
          paddingBottom: 3,
        }}>
          {presets.map(p => (
            <button key={p.id}
              onClick={() => applyPreset(p)}
              title={p.text}
              style={{
                all: "unset", cursor: "pointer", flexShrink: 0,
                padding: "3px 9px", borderRadius: 99,
                border: "1.1px solid var(--ink)",
                background: "linear-gradient(180deg, var(--point-soft) 0%, var(--point) 100%)",
                fontFamily: "var(--hand)", fontSize: 11.5, color: "var(--ink)",
                whiteSpace: "nowrap",
              }}>⚡ {p.label || p.text.slice(0, 16)}</button>
          ))}
        </div>
      )}

      {/* 큰 textarea */}
      <textarea
        value={m.draft ?? ""}
        onChange={e => actions.updateEmail(m.id, { draft: e.target.value })}
        placeholder={L("mail.draftPlaceholder")}
        style={{
          flex: 1, minHeight: 0,
          width: "100%", boxSizing: "border-box", resize: "none",
          border: "1.1px solid var(--ink)", borderRadius: 8, outline: "none",
          background: "#ffffff", padding: "8px 10px",
          fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)", lineHeight: 1.5,
        }}
      />
    </div>
  );
}

// ---- 1번째 화면 아래 — 빠른 답장 프리셋 관리 ----
function PresetsList({ presets, actions }) {
  const [editing, setEditing] = useState(null); // id 또는 "new" 또는 null
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");

  const startEdit = (p) => {
    setEditing(p.id);
    setLabel(p.label || "");
    setText(p.text || "");
  };
  const startNew = () => {
    setEditing("new");
    setLabel("");
    setText("");
  };
  const save = () => {
    if (editing === "new") {
      if (!text.trim() && !label.trim()) { setEditing(null); return; }
      actions.addReplyPreset({ label, text });
    } else if (editing) {
      actions.updateReplyPreset(editing, { label: label.trim(), text });
    }
    setEditing(null);
  };
  const cancel = () => setEditing(null);
  const del = async (id) => {
    const ok = await window.dialog.confirm(L("mail.presetDelConfirm"));
    if (ok) actions.removeReplyPreset(id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexShrink: 0 }}>
        <span className="sk-label" style={{ flex: 1 }}>⚡ {L("mail.presets")} · {presets.length}</span>
        {editing !== "new" && (
          <button onClick={startNew} style={{
            ...mailBtn, padding: "2px 9px", fontSize: 11,
            background: "linear-gradient(180deg, var(--point-soft), var(--point))",
          }}>＋ {L("mail.presetNew")}</button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {editing === "new" && (
          <PresetEditor label={label} setLabel={setLabel} text={text} setText={setText} onSave={save} onCancel={cancel} />
        )}
        {presets.length === 0 && editing !== "new" && (
          <div className="sk-cap">{L("mail.presetEmpty")}</div>
        )}
        {presets.map(p => editing === p.id ? (
          <PresetEditor key={p.id} label={label} setLabel={setLabel} text={text} setText={setText} onSave={save} onCancel={cancel} />
        ) : (
          <PresetRow key={p.id} p={p} onCopy={() => copyText(p.text)} onEdit={() => startEdit(p)} onDelete={() => del(p.id)} />
        ))}
      </div>
    </div>
  );
}

function PresetRow({ p, onCopy, onEdit, onDelete }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7, padding: "5px 9px", marginBottom: 5,
      borderRadius: 8, border: "1.1px solid var(--ink-soft)",
      background: "var(--paper)",
    }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>⚡</span>
      <button onClick={onCopy} title={L("mail.copyClipboard")} style={{
        all: "unset", cursor: "pointer", flex: 1, minWidth: 0,
      }}>
        <div style={{
          fontFamily: "var(--hand)", fontSize: 13, fontWeight: 700, color: "var(--ink)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{p.label || L("mail.noLabel")}</div>
        <div style={{
          fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink-2)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3,
        }}>{(p.text || "").slice(0, 60)}</div>
      </button>
      <button onClick={onEdit} title={L("mail.edit")} style={mailIconBtn}>✎</button>
      <DelBtn onClick={onDelete} />
    </div>
  );
}

function PresetEditor({ label, setLabel, text, setText, onSave, onCancel }) {
  return (
    <div style={{
      border: "1.1px solid var(--ink)", borderRadius: 8, padding: 8, marginBottom: 6,
      background: "#ffffff", display: "flex", flexDirection: "column", gap: 5,
    }}>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={L("mail.presetLabel")}
        style={{
          border: "1px solid var(--ink-soft)", borderRadius: 6,
          padding: "4px 8px", outline: "none",
          fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
          background: "#ffffff",
        }}
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={L("mail.presetText")}
        rows={3}
        style={{
          border: "1px solid var(--ink-soft)", borderRadius: 6,
          padding: "5px 8px", outline: "none", resize: "vertical",
          fontFamily: "var(--hand)", fontSize: 12.5, color: "var(--ink)",
          background: "#ffffff", lineHeight: 1.45,
          minHeight: 50,
        }}
      />
      <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{
          ...mailBtn, padding: "3px 10px", fontSize: 11.5,
        }}>{L("mail.presetCancel")}</button>
        <button onClick={onSave} style={{
          ...mailBtn, padding: "3px 10px", fontSize: 11.5,
          background: "linear-gradient(180deg, var(--point-soft), var(--point))",
          fontWeight: 700,
        }}>{L("mail.presetSave")}</button>
      </div>
    </div>
  );
}

const mailBtn = {
  all: "unset", cursor: "pointer",
  padding: "4px 12px", borderRadius: 99,
  border: "1.1px solid var(--ink)", background: "var(--paper)",
  fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
};
const mailIconBtn = {
  ...mailBtn,
  width: 23, height: 23, padding: 0,
  display: "grid", placeItems: "center",
  borderRadius: 6, flexShrink: 0,
};

window.MailView = MailView;
