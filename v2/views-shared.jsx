/* global React, diary, L, useI18n */
// ===========================================================
// 공통 컴포넌트 — 모든 뷰에서 재사용
// ===========================================================
const { useState, useRef, useEffect } = React;

// macOS Tauri WKWebView 에서 window.alert/confirm/prompt 가 동작하지 않음 → 인앱 모달로 대체
let _dialogPush = null;
const _dialogPending = [];

function _enqueueDialog(entry) {
  return new Promise((resolve) => {
    const item = { id: Date.now() + Math.random(), ...entry, resolve };
    if (_dialogPush) _dialogPush(item);
    else _dialogPending.push(item);
  });
}

function DialogHost() {
  const [stack, setStack] = useState([]);
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    _dialogPush = (item) => setStack((s) => [...s, item]);
    if (_dialogPending.length) {
      setStack((s) => [...s, ..._dialogPending.splice(0)]);
    }
    return () => { _dialogPush = null; };
  }, []);

  const top = stack[0];

  useEffect(() => {
    if (!top || top.kind !== "prompt") return;
    setInput(top.defaultValue ?? "");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [top?.id, top?.kind, top?.defaultValue]);

  if (!top) return null;

  const close = (value) => {
    top.resolve(value);
    setStack((s) => s.slice(1));
  };

  const isPrompt = top.kind === "prompt";
  const isConfirm = top.kind === "confirm";

  const okLabel = typeof L === "function" ? L("todo.yes") : "OK";
  const cancelLabel = typeof L === "function" ? L("todo.no") : "Cancel";

  return (
    <div
      onClick={() => close(isPrompt ? null : isConfirm ? false : undefined)}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(138, 106, 94, 0.35)",
        backdropFilter: "blur(2px)",
        display: "grid", placeItems: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="xp-window"
        style={{ width: "min(360px, 92vw)", boxShadow: "0 8px 0 var(--paper-3), 0 12px 30px rgba(138,106,94,0.3)" }}
        onKeyDown={(e) => {
          if (e.key === "Escape") close(isPrompt ? null : isConfirm ? false : undefined);
          if (e.key === "Enter" && isPrompt) { e.preventDefault(); close(input); }
        }}
      >
        <div className="xp-titlebar">
          <span className="ttl">todoary</span>
        </div>
        <div className="xp-body">
          <div style={{ fontFamily: "var(--hand)", fontSize: 14, color: "var(--ink)", whiteSpace: "pre-wrap", marginBottom: isPrompt ? 10 : 14 }}>
            {top.message}
          </div>
          {isPrompt && (
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                border: "1.1px solid var(--ink)", borderRadius: 6,
                padding: "6px 8px", marginBottom: 12,
                fontFamily: "var(--hand)", fontSize: 14, background: "white",
              }}
            />
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {(isConfirm || isPrompt) && (
              <button
                type="button"
                onClick={() => close(isPrompt ? null : false)}
                style={{
                  all: "unset", cursor: "pointer",
                  padding: "4px 14px", borderRadius: 99,
                  border: "1.1px solid var(--ink)", background: "var(--paper)",
                  fontFamily: "var(--hand)", fontSize: 13,
                }}
              >{cancelLabel}</button>
            )}
            <button
              type="button"
              onClick={() => close(isPrompt ? input : isConfirm ? true : undefined)}
              style={{
                all: "unset", cursor: "pointer",
                padding: "4px 14px", borderRadius: 99,
                border: "1.1px solid var(--ink)", background: "var(--point)",
                fontFamily: "var(--hand)", fontSize: 13, fontWeight: 700,
              }}
            >{okLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

if (typeof window !== "undefined") {
  const existingDialog = window.dialog || {};
  window.dialog = {
    ...existingDialog,
    alert: existingDialog.alert || ((message) => _enqueueDialog({ kind: "alert", message: String(message ?? "") })),
    confirm: existingDialog.confirm || ((message) => _enqueueDialog({ kind: "confirm", message: String(message ?? "") })),
    prompt: existingDialog.prompt || ((message, defaultValue = "") => _enqueueDialog({
      kind: "prompt",
      message: String(message ?? ""),
      defaultValue: defaultValue ?? "",
    })),
  };
}

// ---- 도트 스프라이트 아이콘 (16x16 셀, 6x4 = 24 인덱스) ----
// Sprite-0002.png (96x64) 한 장에서 인덱스로 잘라 표시한다.
// 표시 크기는 size 로 조절 (배수 — 16/24/32/48 ...).
const SPRITE_COLS = 6;
const SPRITE_ROWS = 4;
const SPRITE_CELL = 16;
function SpriteIcon({ idx = 0, size = 16, title, style }) {
  const col = idx % SPRITE_COLS;
  const row = Math.floor(idx / SPRITE_COLS);
  const scale = size / SPRITE_CELL;
  return (
    <span
      className="sprite-icon"
      title={title}
      style={{
        width: size,
        height: size,
        backgroundSize: `${SPRITE_COLS * size}px ${SPRITE_ROWS * size}px`,
        backgroundPosition: `${-col * size}px ${-row * size}px`,
        ...style,
      }}
    />
  );
}
// 메모 픽커용 인덱스 모음 — store.jsx 에서 채워 넣음. 기본은 0..23 전체.
const MEMO_SPRITE_IDXS = Array.from({ length: SPRITE_COLS * SPRITE_ROWS }, (_, i) => i);
// 전역 노출
window.SpriteIcon = SpriteIcon;
window.MEMO_SPRITE_IDXS = MEMO_SPRITE_IDXS;

function ViewHeader({ ttl, sub, action }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontFamily: "var(--hand)", fontSize: 22, fontWeight: 700 }}>{ttl}</div>
        {action}
      </div>
      {sub && <div className="sk-cap" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Divider() {
  return <hr style={{ border: 0, borderTop: "1.1px dashed var(--ink-soft)", margin: "16px 0" }} />;
}

// 본문을 가운데 선으로 위/아래 반반 나누는 레이아웃
function SplitPane({
  topLabel, topRight, top,
  middle,
  bottomLabel, bottomRight, bottom,
  bottomScroll = true,
  bottomHeight,            // number → 리사이즈 모드 (고정 높이). undefined → 기본 flex 2:1.
  onBottomHeightChange,    // (rawHeightPx) => void  ※ 스냅은 호출자가 처리
}) {
  useI18n();
  const isResizable = typeof bottomHeight === "number" && typeof onBottomHeightChange === "function";
  const sec = { minHeight: 0, overflowX: "hidden" };
  const head = { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 };

  const onDragStart = (e) => {
    if (!isResizable) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomHeight;
    const onMove = (ev) => {
      const delta = startY - ev.clientY;  // 위로 끌면 +, 아래로 끌면 −
      onBottomHeightChange(startH + delta);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 위 — 리사이즈 모드일 땐 남은 공간 전부 차지 */}
      <div style={{
        ...sec, overflowY: "auto",
        flex: isResizable ? 1 : 2,
        padding: "12px 14px 10px",
      }}>
        {(topLabel || topRight) && (
          <div style={head}>
            <div className="sk-label" style={{ flex: 1 }}>{topLabel}</div>
            {topRight}
          </div>
        )}
        {top}
      </div>
      {/* 가운데 — 옵션 슬롯(예: 진행도 바) */}
      {middle && <div style={{ flexShrink: 0 }}>{middle}</div>}
      {/* 구분선 / 리사이즈 핸들 */}
      <div
        onMouseDown={onDragStart}
        style={{
          flexShrink: 0,
          borderTop: "1.6px solid var(--ink)",
          height: isResizable ? 6 : 0,
          cursor: isResizable ? "ns-resize" : "default",
          background: "transparent",
          userSelect: "none",
        }}
        title={isResizable ? L("split.resizeCal") : undefined}
      />
      {/* 아래 — 리사이즈 모드면 고정 높이 */}
      <div style={{
        ...sec,
        overflowY: bottomScroll ? "auto" : "hidden",
        flex: isResizable ? "none" : 1,
        height: isResizable ? bottomHeight : undefined,
        padding: "10px 14px 12px",
      }}>
        {(bottomLabel || bottomRight) && (
          <div style={head}>
            <div className="sk-label" style={{ flex: 1 }}>{bottomLabel}</div>
            {bottomRight}
          </div>
        )}
        {bottom}
      </div>
    </div>
  );
}

// 인라인 입력창 — placeholder가 카와이 손글씨, 엔터로 submit
function InlineAdd({ placeholder, onAdd, multiline = false, dashed = true }) {
  useI18n();
  const [v, setV] = useState("");
  const submit = () => {
    if (!v.trim()) return;
    onAdd(v.trim());
    setV("");
  };
  const onKey = (e) => {
    if (e.key === "Enter" && (!multiline || (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      submit();
    }
  };
  const Tag = multiline ? "textarea" : "input";
  return (
    <div className={"sk-box " + (dashed ? "sk-dashed" : "")} style={{
      padding: "6px 10px", display: "flex", alignItems: "center", gap: 7,
      background: "var(--paper)",
    }}>
      <span className="sk-plus" style={{ flexShrink: 0 }}>+</span>
      <Tag
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        rows={multiline ? 2 : undefined}
        style={{
          flex: 1, border: 0, outline: "none", background: "transparent",
          fontFamily: "var(--hand)", fontSize: 15, color: "var(--ink)",
          resize: multiline ? "vertical" : undefined,
          minHeight: multiline ? 36 : undefined,
        }}
      />
      {v.trim() && (
        <button onClick={submit} style={{
          all: "unset", cursor: "pointer",
          background: "var(--pink)", border: "1.1px solid var(--ink)",
          padding: "1px 10px", borderRadius: 99,
          fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
        }}>{L("common.save")}</button>
      )}
    </div>
  );
}

// 인라인 편집 가능한 텍스트 (contenteditable)
function Editable({ value, onChange, placeholder = "", multiline = false, style = {} }) {
  const ref = useRef(null);
  const lastSavedRef = useRef(value);
  // 외부에서 value 바뀌면 DOM 반영
  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value || "";
      lastSavedRef.current = value;
    }
  }, [value]);
  const onBlur = () => {
    const v = ref.current.innerText.trim();
    if (v !== lastSavedRef.current) {
      lastSavedRef.current = v;
      onChange(v);
    }
  };
  const onKey = (e) => {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      ref.current.blur();
    }
  };
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={onBlur}
      onKeyDown={onKey}
      className="editable"
      style={{
        outline: "none",
        minHeight: multiline ? 40 : 22,
        padding: "1px 4px",
        borderRadius: 4,
        cursor: "text",
        ...style,
      }}
    />
  );
}

// 삭제 버튼 (작은 ×)
function DelBtn({ onClick }) {
  if (typeof useI18n === "function") useI18n();
  return (
    <button onClick={onClick} title={L("common.delete")} style={{
      all: "unset", cursor: "pointer",
      width: 16, height: 16, borderRadius: "50%",
      display: "grid", placeItems: "center",
      fontFamily: "var(--mono)", fontSize: 10,
      color: "var(--ink-3)",
      background: "transparent",
    }}>×</button>
  );
}

// 토글 (작은 둥근 버튼)
function ToggleBadge({ on, onClick, children, color = "var(--hi)" }) {
  return (
    <button onClick={onClick} style={{
      all: "unset", cursor: "pointer",
      fontFamily: "var(--hand)", fontSize: 12,
      padding: "1px 8px", borderRadius: 99,
      border: "1.1px solid var(--ink)",
      background: on ? color : "var(--paper)",
      color: "var(--ink)",
    }}>{children}</button>
  );
}

// ---- 오늘 요약 (sticky 헤더 — 모든 탭 공통) ----
function TodaySummary() {
  useI18n();
  const { state } = diary.useDiary();
  const today = diary.today();
  const todos = (state.todos ?? []).filter(t => t.projectId === state.currentProjectId && !t.done);
  const minutes = (state.workSessions ?? []).find(w => w.date === today)?.minutes ?? 0;
  const unreplied = (state.emails ?? []).filter(e => !e.replied).length;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: "var(--hand)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
        {L("header.todayTitle", { date: diary.fmtKDate(today) })}
      </div>
      <div className="sk-cap" style={{ marginTop: 1, fontSize: 13 }}>
        {L("header.todaySub", { minutes, todos: todos.length, mail: unreplied })}
      </div>
    </div>
  );
}

// ---- 외부 열기 헬퍼 (Tauri opener 플러그인 / 웹 폴백) ----
function openExternalUrl(url) {
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const op = window.__TAURI__ && window.__TAURI__.opener;
    if (op && op.openUrl) { op.openUrl(url); return; }
  } catch (_) {}
  try { window.open(url, "_blank"); } catch (_) {}
}
function openLocalPath(path) {
  if (!path) return;
  try {
    const op = window.__TAURI__ && window.__TAURI__.opener;
    if (op && op.openPath) { op.openPath(path).catch(() => op.revealItemInDir && op.revealItemInDir(path)); return; }
    if (op && op.revealItemInDir) { op.revealItemInDir(path); return; }
  } catch (e) {
    alert(L("proj.folderOpenFail", { msg: (e && e.message ? e.message : e) }));
    return;
  }
  alert(L("proj.folderDesktopOnly"));
}
function pathBasename(p) {
  if (!p) return "";
  const parts = p.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

// ---- 상단 헤더 액션 칩 ----
function HdrChip({ onClick, title, children, accent }) {
  return (
    <button onClick={onClick} title={title} style={{
      all: "unset", cursor: "pointer",
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 9px", borderRadius: 99,
      border: "1.1px solid var(--ink)",
      background: accent ? "var(--point)" : "rgba(255,255,255,0.6)",
      fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink)",
      maxWidth: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    }}>{children}</button>
  );
}

// 헤더 우측 작은 아이콘 버튼 스타일
function hdrIconBtn(active) {
  return {
    all: "unset", cursor: "pointer",
    width: 24, height: 22, borderRadius: 7, flexShrink: 0,
    display: "grid", placeItems: "center",
    fontSize: 12, color: "var(--ink)",
    background: active ? "var(--point)" : "rgba(255,255,255,0.55)",
    border: "1px solid var(--ink)",
  };
}

// ---- 프로젝트 스위쳐 (타이틀바에서 사용) — 프로젝트명 + 메뉴 ----
function ProjectSwitcher() {
  const { state, actions } = diary.useDiary();
  const project = diary.select.currentProject(state);
  const [open, setOpen] = useState(false);

  async function addNew() {
    setOpen(false);
    const name = await window.dialog.prompt(L("proj.newPrompt"));
    if (name?.trim()) actions.addProject({ name: name.trim() });
  }
  async function rename() {
    if (!project) return;
    setOpen(false);
    const name = await window.dialog.prompt(L("proj.renamePrompt"), project.name);
    if (name?.trim()) actions.updateProject(project.id, { name: name.trim() });
  }
  async function removeCurrent() {
    if (!project) return;
    setOpen(false);
    const ok = await window.dialog.confirm(L("proj.deleteConfirm", { name: project.name }));
    if (ok) actions.removeProject(project.id);
  }

  return (
    <div style={{ position: "relative", flexShrink: 0, maxWidth: 220 }}>
      <button onClick={() => setOpen(o => !o)} title={L("proj.menu")} style={{
        all: "unset", cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 5, maxWidth: 220,
        fontFamily: "var(--hand)", fontSize: 13, fontWeight: 700, color: "var(--ink)",
      }}>
        <span style={{ flexShrink: 0 }}>💾</span>
        <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {project?.name || L("proj.fallback")}
        </span>
        <span style={{ fontSize: 9, opacity: .7, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 6, minWidth: 180,
          background: "var(--paper)", border: "1.1px solid var(--ink)",
          borderRadius: 10, padding: 8, zIndex: 60,
          boxShadow: "0 4px 0 var(--paper-3)",
        }}>
          <div className="sk-label" style={{ marginBottom: 6 }}>{L("proj.menu")}</div>
          {state.projects.map(p => (
            <button key={p.id} onClick={() => { actions.switchProject(p.id); setOpen(false); }}
              style={{
                all: "unset", display: "block", width: "100%",
                padding: "5px 8px", borderRadius: 6,
                fontFamily: "var(--hand)", fontSize: 15, cursor: "pointer",
                background: p.id === project?.id ? "var(--hi-soft)" : "transparent",
                color: "var(--ink)", marginBottom: 2,
              }}>
              <span style={{ display: "inline-block", width: 14, fontFamily: "var(--mono)" }}>
                {p.id === project?.id ? "●" : "○"}
              </span>
              {p.name}
            </button>
          ))}
          <hr className="sk-hr" />
          <button onClick={addNew} style={menuItem}>{L("proj.new")}</button>
          {project && <button onClick={rename} style={menuItem}>{L("proj.rename")}</button>}
          {project && (
            <button onClick={removeCurrent} style={{ ...menuItem, color: "var(--bad)" }}>
              {L("proj.delete", { name: project.name })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- git / 폴더 버튼 (키보드 위 줄에서 사용) ----
function RepoButtons() {
  useI18n();
  const { state, actions } = diary.useDiary();
  const project = diary.select.currentProject(state);
  if (!project) return null;

  async function openGit() {
    let url = project.repoUrl;
    if (!url) {
      url = (await window.dialog.prompt(L("proj.gitPrompt"))) || "";
      if (!url.trim()) return;
      actions.updateProject(project.id, { repoUrl: url.trim() });
      url = url.trim();
    }
    openExternalUrl(url);
  }
  async function openFolder() {
    let p = project.path;
    if (!p) {
      p = (await window.dialog.prompt(L("proj.folderPrompt"))) || "";
      if (!p.trim()) return;
      actions.updateProject(project.id, { path: p.trim() });
      p = p.trim();
    }
    openLocalPath(p);
  }

  const keyBtn = {
    all: "unset", cursor: "pointer", flex: 1, minWidth: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
    padding: "5px 8px", borderRadius: 8,
    border: "1.1px solid var(--ink)",
    background: "linear-gradient(180deg, #ffffff 0%, #e7edf4 100%)",
    boxShadow: "0 2px 0 #97a6b8, inset 0 1px 0 rgba(255,255,255,0.9)",
    fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  };

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 7 }}>
      <button onClick={openGit} title={project.repoUrl || L("proj.gitConnectTip")} style={keyBtn}>
        ↗ {project.repoUrl ? L("proj.gitRepo") : L("proj.gitConnect")}
      </button>
      <button onClick={openFolder} title={project.path || L("proj.folderConnectTip")} style={keyBtn}>
        📁 {project.path ? pathBasename(project.path) : L("proj.folderConnect")}
      </button>
    </div>
  );
}

const menuItem = {
  all: "unset", display: "block", width: "100%",
  padding: "5px 8px", borderRadius: 6,
  fontFamily: "var(--hand)", fontSize: 14,
  cursor: "pointer",
  color: "var(--ink-2)",
  marginBottom: 2,
};
const btnLink = {
  all: "unset", cursor: "pointer", marginLeft: 6,
  fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
  textDecoration: "underline",
};

// ---- 포인트(액센트) 색 일괄 적용: 버튼 등 var(--point)/var(--hi) 전부 ----
function applyAccent(c) {
  if (!c) return;
  const r = document.documentElement.style;
  const soft = `color-mix(in srgb, ${c} 45%, white)`;
  r.setProperty("--hi", c);
  r.setProperty("--point", c);
  r.setProperty("--hi-soft", soft);
  r.setProperty("--point-soft", soft);
}
window.applyAccent = applyAccent;

// ---- 그라데이션 빌더 (다중 색 스탑 / 선형·원형) ----
function buildGradient(type, angle, stops) {
  const arr = (stops && stops.length >= 2) ? stops : [{ c: "#a9cdf5", p: 0 }, { c: "#ffffff", p: 100 }];
  const sorted = [...arr].sort((a, b) => (a.p ?? 0) - (b.p ?? 0));
  const list = sorted.map(s => `${s.c} ${s.p ?? 0}%`).join(", ");
  if (type === "radial") return `radial-gradient(circle at 50% 50%, ${list})`;
  return `linear-gradient(${angle ?? 180}deg, ${list})`;
}

// 도형(하트/별) 배경 — 블러 처리한 SVG를 background 로. shape="none"이면 일반 그라데이션.
function buildBackground(type, angle, stops, shape) {
  const arr = (stops && stops.length >= 2) ? stops : [{ c: "#a9cdf5", p: 0 }, { c: "#ffffff", p: 100 }];
  const sorted = [...arr].sort((a, b) => (a.p ?? 0) - (b.p ?? 0));
  const inner = sorted[0].c;
  const outer = sorted[sorted.length - 1].c;
  const mid = sorted[Math.floor((sorted.length - 1) / 2)].c;
  if (!shape || shape === "none") return buildGradient(type, angle, stops);

  const HEART = "M50 84 C 12 56 8 22 34 18 C 46 16 50 30 50 36 C 50 30 54 16 66 18 C 92 22 88 56 50 84 Z";
  const STAR = "M0 -20 L5.9 -8.1 L19 -6.2 L9.5 3 L11.8 16.2 L0 10 L-11.8 16.2 L-9.5 3 L-19 -6.2 L-5.9 -8.1 Z";
  const filt = "<filter id='b' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='3.4'/></filter>";
  const hc = (s) => `translate(50 106) scale(${s}) translate(-50 -51)`;
  // 흩뿌리기 위치 (viewBox 100x200)
  const PLACES = [
    { x: 24, y: 42, r: 22 }, { x: 73, y: 60, r: 27 }, { x: 46, y: 110, r: 20 },
    { x: 85, y: 148, r: 15 }, { x: 16, y: 138, r: 16 }, { x: 60, y: 178, r: 20 },
  ];
  let inner_svg = "";

  if (shape === "hearts") {
    // 겹하트 (동심)
    const cols = [inner, outer, inner, outer, inner];
    const scales = [1.55, 1.18, 0.84, 0.52, 0.22];
    inner_svg = scales.map((s, i) => `<g filter='url(#b)' transform='${hc(s)}'><path fill='${cols[i % cols.length]}' d='${HEART}'/></g>`).join("");
  } else {
    // 하트/별/클로버/리본/금붕어 — 여러 개 흩뿌리기
    const M = {
      heart:  { m: (c) => `<path fill='${c}' d='${HEART}'/>`, ox: 50, oy: 50, box: 78 },
      stars:  { m: (c) => `<path fill='${c}' d='${STAR}'/>`,  ox: 0,  oy: 0,  box: 40 },
      clover: { m: (c) => `<g fill='${c}'><circle cx='38' cy='38' r='15'/><circle cx='62' cy='38' r='15'/><circle cx='38' cy='62' r='15'/><circle cx='62' cy='62' r='15'/><rect x='48' y='52' width='4' height='28'/></g>`, ox: 50, oy: 52, box: 74 },
      ribbon: { m: (c) => `<g fill='${c}'><path d='M50 50 L24 34 L24 66 Z'/><path d='M50 50 L76 34 L76 66 Z'/><circle cx='50' cy='50' r='8'/><path d='M46 56 L36 80 L44 78 Z'/><path d='M54 56 L64 80 L56 78 Z'/></g>`, ox: 50, oy: 54, box: 64 },
      fish:   { m: (c) => `<g fill='${c}'><ellipse cx='43' cy='50' rx='22' ry='14'/><path d='M62 50 L82 36 L82 64 Z'/></g>`, ox: 52, oy: 50, box: 70 },
    }[shape];
    if (M) {
      const cols = [inner, mid];
      inner_svg = PLACES.map((p, i) => {
        const s = (p.r * 2 / M.box).toFixed(3);
        return `<g filter='url(#b)' transform='translate(${p.x} ${p.y}) scale(${s}) translate(${-M.ox} ${-M.oy})'>${M.m(cols[i % cols.length])}</g>`;
      }).join("");
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 200' preserveAspectRatio='xMidYMid slice'><defs>${filt}</defs><rect width='100' height='200' fill='${outer}'/>${inner_svg}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center/cover no-repeat`;
}

// ---- 마스킹테이프 스타일 ----
const TAPE_COLORS = [
  ["#ffd9e6", "dots"], ["#fdffc0", "diag"], ["#d9f0c0", "dots"], ["#ffd0d8", "diag"],
  ["#c6ecd7", "gingham"], ["#e2d6f5", "dots"], ["#cfe2fa", "dots"], ["#f3e8c8", "gingham"],
];
const TAPE_PAT = {
  dots: "radial-gradient(rgba(255,255,255,.7) 1.6px, transparent 1.7px) 0 0 / 9px 9px",
  diag: "repeating-linear-gradient(45deg, rgba(255,255,255,.5) 0 2px, transparent 2px 7px)",
  gingham: "repeating-linear-gradient(0deg, rgba(255,255,255,.4) 0 4px, transparent 4px 8px), repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 4px, transparent 4px 8px)",
};
function tapeStyle(i) {
  const [c, p] = TAPE_COLORS[((i % TAPE_COLORS.length) + TAPE_COLORS.length) % TAPE_COLORS.length];
  return { background: `${TAPE_PAT[p]}, ${c}` };
}

if (!document.getElementById("tape-css")) {
  const s = document.createElement("style");
  s.id = "tape-css";
  s.textContent = `
    .tape {
      position: relative;
      border-radius: 2px;
      box-shadow: 0 2px 3px rgba(40,51,63,.16);
      -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 9px, #000 calc(100% - 9px), transparent 100%);
              mask-image: linear-gradient(90deg, transparent 0, #000 9px, #000 calc(100% - 9px), transparent 100%);
    }
  `;
  document.head.appendChild(s);
}

// editable placeholder CSS (한 번만 주입)
if (!document.getElementById("editable-placeholder-css")) {
  const s = document.createElement("style");
  s.id = "editable-placeholder-css";
  s.textContent = `
    .editable:empty::before {
      content: attr(data-placeholder);
      color: var(--ink-3);
      pointer-events: none;
    }
    .editable:focus { background: var(--hi-soft); }
  `;
  document.head.appendChild(s);
}

window.ViewHeader = ViewHeader;
window.SplitPane = SplitPane;
window.tapeStyle = tapeStyle;
window.buildGradient = buildGradient;
window.buildBackground = buildBackground;
window.TodaySummary = TodaySummary;
window.Divider = Divider;
window.InlineAdd = InlineAdd;
window.Editable = Editable;
window.DelBtn = DelBtn;
window.ToggleBadge = ToggleBadge;
window.ProjectSwitcher = ProjectSwitcher;
window.RepoButtons = RepoButtons;
window.DialogHost = DialogHost;
