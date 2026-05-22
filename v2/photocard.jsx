/* global React */
// ===========================================================
// 포토카드 (실험) — Tauri 투명창을 이용해 화면 위에 "포카"를 얹는다.
// • 전체창 투명 오버레이 + 가운데 투명 포카(테두리=매트)
// • 매트(테두리)를 드래그하면 창이 이동 → 작업 화면 위 구도 잡기
// • 포카 안쪽(테두리 안)을 스티커/캡션으로 꾸밈 (사진처럼)
// • 📸 카메라 버튼: 테두리 안쪽 영역만 캡처해 PNG 저장
// ===========================================================
(function () {
  const state = { active: false, shape: "polaroid", texture: "white" };
  const subs = new Set();
  const emit = () => { for (const fn of subs) fn(); };
  function setAlwaysOnTop(v) {
    try {
      const w = window.__TAURI__ && window.__TAURI__.window;
      if (w && w.getCurrentWindow) w.getCurrentWindow().setAlwaysOnTop(!!v);
    } catch (_) {}
  }
  window.photocard = {
    getState() { return state; },
    set(patch) {
      const was = state.active;
      Object.assign(state, patch);
      emit();
      if ("active" in patch && patch.active !== was) setAlwaysOnTop(state.active);
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
})();

function usePhotocard() {
  const [, f] = React.useState(0);
  React.useEffect(() => window.photocard.subscribe(() => f(x => x + 1)), []);
  return window.photocard;
}

const PC_SHAPES = [
  { id: "polaroid", label: "폴라로이드" },
  { id: "rect",     label: "기본" },
  { id: "circle",   label: "원형" },
  { id: "wide",     label: "와이드" },
];
const PC_TEXTURES = [
  { id: "white",  label: "화이트", color: "#ffffff" },
  { id: "cream",  label: "크림",   color: "#fff4e0" },
  { id: "pink",   label: "핑크",   color: "#ffd6e0" },
  { id: "mint",   label: "민트",   color: "#c6ecd7" },
  { id: "blue",   label: "블루",   color: "#cfe2fa" },
  { id: "film",   label: "필름",   color: "#1c1c1c" },
];
const PC_STICKERS = ["💖", "⭐️", "🌸", "🎀", "✨", "🫧", "🐱", "🐟", "🍀", "🌈", "💫", "🍓"];

function pcFrameBorder(shape) {
  if (shape === "polaroid") return "16px 16px 58px 16px";
  if (shape === "wide")     return "40px 16px";
  if (shape === "circle")   return "24px";
  return "20px";
}
function pcRadius(shape) { return shape === "circle" ? "50%" : 16; }

// ---- 캡처: 테두리 안쪽(innerEl)만 잘라 PNG 저장 ----
async function pcCapture(innerEl, setMsg, beforeShot, afterShot) {
  if (!innerEl) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setMsg("이 환경에선 캡처 미지원 — Win+Shift+S 사용"); return;
  }
  let stream;
  try {
    setMsg("화면 선택창에서 ‘전체 화면’을 골라주세요…");
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
    const video = document.createElement("video");
    video.srcObject = stream; video.muted = true;
    await video.play();

    if (beforeShot) beforeShot();           // 툴바 등 UI 숨김
    await new Promise(r => setTimeout(r, 250));

    const rect = innerEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    let originX = (window.screenX || 0) * dpr, originY = (window.screenY || 0) * dpr;
    try {
      const T = window.__TAURI__;
      if (T && T.window && T.window.getCurrentWindow) {
        const pos = await T.window.getCurrentWindow().outerPosition();
        if (pos && typeof pos.x === "number") { originX = pos.x; originY = pos.y; }
      }
    } catch (_) {}
    const sx = Math.round(originX + rect.left * dpr);
    const sy = Math.round(originY + rect.top * dpr);
    const sw = Math.max(1, Math.round(rect.width * dpr));
    const sh = Math.max(1, Math.round(rect.height * dpr));

    const canvas = document.createElement("canvas");
    canvas.width = sw; canvas.height = sh;
    canvas.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    if (afterShot) afterShot();              // UI 복원

    canvas.toBlob((blob) => {
      if (!blob) { setMsg("캡처 실패"); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `photocard-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMsg("저장됨 ✓ (다운로드 폴더)");
    }, "image/png");
  } catch (e) {
    if (afterShot) afterShot();
    setMsg("캡처 취소/실패: " + (e && e.message ? e.message : e));
  } finally {
    if (stream) stream.getTracks().forEach(t => t.stop());
  }
}

// ---- 탭 안의 런처 (포토카드 켜기) ----
function PhotocardView() {
  const pc = usePhotocard();
  return (
    <div style={{ padding: "16px 4px" }}>
      <div className="sk-cap" style={{ marginBottom: 12, lineHeight: 1.5 }}>
        화면 위에 투명 포토카드를 띄워 꾸미고, 카메라로 <b>테두리 안쪽</b>만 캡처해요.
        포카 테두리를 드래그해 작업 화면 위에 올려보세요.
      </div>
      <button onClick={() => pc.set({ active: true })} style={{
        all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box",
        textAlign: "center", padding: "12px", borderRadius: 14,
        border: "1.2px solid var(--ink)",
        background: "linear-gradient(180deg, var(--point-soft), var(--point))",
        fontFamily: "var(--hand)", fontWeight: 700, fontSize: 16, color: "var(--ink)",
      }}>📷 포토카드 오버레이 켜기</button>
    </div>
  );
}

// ---- 전체창 투명 오버레이 ----
function PhotocardOverlay() {
  const pc = usePhotocard();
  const s = pc.getState();
  const tex = PC_TEXTURES.find(t => t.id === s.texture) || PC_TEXTURES[0];
  const innerRef = React.useRef(null);
  const [msg, setMsg] = React.useState("");
  const [stickers, setStickers] = React.useState([]);
  const [caption, setCaption] = React.useState("");
  const [sel, setSel] = React.useState(null);
  const [chrome, setChrome] = React.useState(true);  // 캡처 시 UI 숨김
  const idRef = React.useRef(1);

  React.useEffect(() => { window.photocard.set({}); }, []);

  const addSticker = (ch) => {
    const id = idRef.current++;
    setStickers(prev => [...prev, { id, ch, x: 50, y: 46, size: 42 }]);
    setSel(id);
  };
  const moveSticker = (e, id) => {
    e.stopPropagation(); e.preventDefault();
    setSel(id);
    const rect = innerRef.current.getBoundingClientRect();
    const move = (ev) => {
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      const y = ((ev.clientY - rect.top) / rect.height) * 100;
      setStickers(prev => prev.map(st => st.id === id
        ? { ...st, x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) } : st));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const resizeSel = (d) => setStickers(prev => prev.map(st => st.id === sel ? { ...st, size: Math.max(18, Math.min(120, st.size + d)) } : st));
  const removeSel = () => { setStickers(prev => prev.filter(st => st.id !== sel)); setSel(null); };

  const shoot = () => {
    pcCapture(innerRef.current, setMsg, () => { setChrome(false); setSel(null); }, () => setChrome(true));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent" }} onPointerDown={() => setSel(null)}>
      {/* 매트(테두리) — 드래그로 창 이동, 가운데 투명 */}
      <div data-tauri-drag-region style={{
        position: "absolute", inset: 8, boxSizing: "border-box",
        background: "transparent",
        borderStyle: "solid", borderColor: tex.color,
        borderWidth: pcFrameBorder(s.shape), borderRadius: pcRadius(s.shape),
        boxShadow: chrome ? "inset 0 0 0 1.4px rgba(0,0,0,.28), 0 12px 30px rgba(0,0,0,.25)" : "none",
      }}>
        {/* 안쪽(캡처 영역) — 꾸미기 레이어 */}
        <div ref={innerRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: s.shape === "circle" ? "50%" : 4 }}>
          {stickers.map(st => (
            <div key={st.id} onPointerDown={(e) => moveSticker(e, st.id)} onDoubleClick={() => { setStickers(p => p.filter(x => x.id !== st.id)); }}
              style={{
                position: "absolute", left: st.x + "%", top: st.y + "%", transform: "translate(-50%,-50%)",
                fontSize: st.size, cursor: "grab", userSelect: "none", lineHeight: 1,
                outline: (chrome && sel === st.id) ? "1.5px dashed rgba(0,0,0,.45)" : "none", outlineOffset: 3,
                touchAction: "none",
              }}>{st.ch}</div>
          ))}
          {/* 캡션 */}
          {(caption || chrome) && (
            <div
              contentEditable={chrome}
              suppressContentEditableWarning
              onInput={(e) => setCaption(e.currentTarget.textContent)}
              data-ph="여기에 글씨…"
              className="pc-caption"
              style={{
                position: "absolute", left: "50%", bottom: "6%", transform: "translateX(-50%)",
                maxWidth: "86%", textAlign: "center", outline: "none",
                fontFamily: "var(--hand)", fontSize: 18, fontWeight: 700,
                color: tex.id === "film" ? "#fff" : "var(--ink)",
                textShadow: "0 1px 3px rgba(255,255,255,.6)", cursor: chrome ? "text" : "default",
              }}>{caption}</div>
          )}
        </div>
      </div>

      {/* 툴바 (캡처 중 숨김) */}
      {chrome && (
        <>
          <div style={{
            position: "absolute", left: "50%", bottom: 12, transform: "translateX(-50%)",
            display: "flex", flexDirection: "column", gap: 6, alignItems: "center",
            maxWidth: "94%",
          }}>
            {/* 스티커 팔레트 */}
            <div style={pcBar}>
              {PC_STICKERS.map(e => (
                <button key={e} onClick={() => addSticker(e)} style={{ all: "unset", cursor: "pointer", fontSize: 18, padding: "0 2px" }}>{e}</button>
              ))}
            </div>
            {/* 모양 / 색 / 크기 / 캡처 / 닫기 */}
            <div style={pcBar}>
              {PC_SHAPES.map(o => (
                <button key={o.id} onClick={() => pc.set({ shape: o.id })} style={{
                  all: "unset", cursor: "pointer", padding: "2px 7px", borderRadius: 99, fontSize: 11,
                  border: "1.1px solid var(--ink)", background: s.shape === o.id ? "var(--point)" : "var(--paper)",
                  fontFamily: "var(--hand)", color: "var(--ink)",
                }}>{o.label}</button>
              ))}
              <span style={pcSep} />
              {PC_TEXTURES.map(o => (
                <button key={o.id} onClick={() => pc.set({ texture: o.id })} title={o.label} style={{
                  all: "unset", cursor: "pointer", width: 16, height: 16, borderRadius: "50%",
                  background: o.color, border: s.texture === o.id ? "2px solid var(--ink)" : "1px solid var(--ink)",
                }} />
              ))}
            </div>
            <div style={pcBar}>
              <button onClick={() => resizeSel(-8)} disabled={!sel} style={pcMini}>－</button>
              <button onClick={() => resizeSel(8)} disabled={!sel} style={pcMini}>＋</button>
              <button onClick={removeSel} disabled={!sel} style={pcMini}>🗑</button>
              <span style={pcSep} />
              <button onClick={shoot} style={{
                all: "unset", cursor: "pointer", padding: "3px 12px", borderRadius: 99,
                border: "1.1px solid var(--ink)",
                background: "linear-gradient(180deg, var(--point-soft), var(--point))",
                fontFamily: "var(--hand)", fontWeight: 700, fontSize: 13, color: "var(--ink)",
              }}>📸 캡처</button>
              <button onClick={() => pc.set({ active: false })} style={{
                all: "unset", cursor: "pointer", padding: "3px 10px", borderRadius: 99,
                border: "1.1px solid var(--ink)", background: "var(--bad)",
                fontFamily: "var(--hand)", fontSize: 12, color: "#fff",
              }}>✕ 닫기</button>
            </div>
          </div>

          {/* 상태 */}
          <div style={{
            position: "absolute", left: "50%", top: 12, transform: "translateX(-50%)",
            background: "rgba(255,255,255,0.92)", border: "1px solid var(--ink-soft)", borderRadius: 99,
            padding: "2px 10px", fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink-2)",
            whiteSpace: "nowrap", maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis",
          }}>{msg || "테두리를 드래그해 위치 잡고 · 스티커/글씨로 꾸민 뒤 📸"}</div>
        </>
      )}
    </div>
  );
}

const pcBar = {
  display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "center",
  background: "rgba(255,255,255,0.96)", border: "1.1px solid var(--ink)",
  borderRadius: 99, padding: "4px 8px", boxShadow: "0 4px 14px rgba(0,0,0,.22)",
};
const pcSep = { width: 1, height: 15, background: "var(--ink-soft)" };
const pcMini = {
  all: "unset", cursor: "pointer", width: 22, height: 20, display: "grid", placeItems: "center",
  borderRadius: 6, border: "1.1px solid var(--ink)", background: "var(--paper)", fontSize: 12, color: "var(--ink)",
};

if (!document.getElementById("pc-caption-css")) {
  const st = document.createElement("style");
  st.id = "pc-caption-css";
  st.textContent = `.pc-caption:empty:before{content:attr(data-ph);color:rgba(0,0,0,.35);}`;
  document.head.appendChild(st);
}

window.PhotocardView = PhotocardView;
window.PhotocardOverlay = PhotocardOverlay;
window.usePhotocard = usePhotocard;
