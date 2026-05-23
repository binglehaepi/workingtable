/* global React */
// ===========================================================
// 포토카드 (실험 v3) — "포토카드" 탭 안에서 바로 편집 (오버레이 모드 X)
// • 꾸며진 파스텔 프레임 + 가운데 컷아웃(투명, 깃털 가장자리)으로 화면이 비침
// • 프레임에 스티커/글씨 배치, 테마 프리셋
// • 📸 카메라: 카드 전체(프레임+컷아웃)를 한 장으로 캡처
// ※ 컷아웃이 화면을 비추려면 데스크탑(투명) 모드여야 함
// ===========================================================

function pcSetAlwaysOnTop(v) {
  try { const w = window.__TAURI__ && window.__TAURI__.window; if (w && w.getCurrentWindow) w.getCurrentWindow().setAlwaysOnTop(!!v); } catch (_) {}
}

const PC_CUTOUTS = [
  { id: "rounded", label: "둥근" },
  { id: "heart",   label: "하트" },
  { id: "blob",    label: "블롭" },
  { id: "oval",    label: "타원" },
];
const PC_EMOJIS = ["🍀", "⭐️", "💖", "🎀", "✨", "🌸", "🐱", "🐶", "🐰", "🐻", "🐟", "🍓", "💌", "🌈", "🫧", "💫"];
const PC_FRAME_COLORS = ["#ffd6e6", "#d6f0d0", "#d6e8ff", "#fff0c0", "#e8dcff", "#ffe0cc", "#ffffff"];

function pcCutoutMask(shape) {
  const blur = "<defs><filter id='f' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='2.4'/></filter></defs>";
  let hole;
  if (shape === "heart") {
    hole = "<path filter='url(#f)' fill='black' transform='translate(50 78) scale(0.62) translate(-50 -51)' d='M50 84 C 12 56 8 22 34 18 C 46 16 50 30 50 36 C 50 30 54 16 66 18 C 92 22 88 56 50 84 Z'/>";
  } else if (shape === "blob") {
    hole = "<path filter='url(#f)' fill='black' d='M50 16 C 80 14 88 44 83 76 C 80 108 70 134 50 136 C 30 134 19 106 16 74 C 12 42 22 18 50 16 Z'/>";
  } else if (shape === "oval") {
    hole = "<ellipse filter='url(#f)' fill='black' cx='50' cy='75' rx='36' ry='56'/>";
  } else {
    hole = "<rect filter='url(#f)' fill='black' x='13' y='15' width='74' height='120' rx='9'/>";
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 150' preserveAspectRatio='none'>${blur}<rect width='100' height='150' fill='white'/>${hole}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const PC_TEMPLATES = [
  { id: "lucky", label: "Lucky", color: "#ffd6e6", shape: "rounded",
    items: [
      { t: "emoji", ch: "🍀", x: 16, y: 24, size: 40 },
      { t: "emoji", ch: "🍀", x: 82, y: 80, size: 34 },
      { t: "emoji", ch: "⭐️", x: 24, y: 84, size: 24 },
      { t: "text", ch: "Lucky", x: 78, y: 68, size: 20, color: "#e58aa8" },
      { t: "text", ch: "LOVE!", x: 24, y: 72, size: 14, color: "#7aa86a" },
    ] },
  { id: "angel", label: "Angel", color: "#d6f0d0", shape: "blob",
    items: [
      { t: "emoji", ch: "⭐️", x: 80, y: 16, size: 34 },
      { t: "emoji", ch: "✨", x: 16, y: 30, size: 22 },
      { t: "emoji", ch: "⭐️", x: 18, y: 84, size: 28 },
      { t: "text", ch: "Angel", x: 80, y: 90, size: 20, color: "#7aa86a" },
    ] },
  { id: "love", label: "Love", color: "#ffd6e6", shape: "heart",
    items: [
      { t: "emoji", ch: "🎀", x: 20, y: 16, size: 30 },
      { t: "emoji", ch: "💖", x: 84, y: 22, size: 26 },
      { t: "emoji", ch: "🍓", x: 82, y: 84, size: 26 },
      { t: "text", ch: "love you", x: 24, y: 86, size: 14, color: "#e58aa8" },
    ] },
  { id: "cat", label: "Cat", color: "#d6e8ff", shape: "rounded",
    items: [
      { t: "emoji", ch: "🐱", x: 82, y: 84, size: 36 },
      { t: "emoji", ch: "🐾", x: 16, y: 80, size: 20 },
      { t: "emoji", ch: "🌸", x: 18, y: 20, size: 24 },
      { t: "text", ch: "my kitty", x: 78, y: 68, size: 13, color: "#6f9bd6" },
    ] },
  { id: "plain", label: "심플", color: "#ffffff", shape: "rounded", items: [] },
];

// 카드 전체(cardEl) 캡처
async function pcCapture(cardEl, setMsg, before, after) {
  if (!cardEl) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { setMsg("이 환경에선 캡처 미지원"); return; }
  let stream;
  try {
    setMsg("화면 선택창에서 ‘전체 화면’을 골라주세요…");
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
    const video = document.createElement("video");
    video.srcObject = stream; video.muted = true; await video.play();
    if (before) before();
    await new Promise(r => setTimeout(r, 260));
    const rect = cardEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    let ox = (window.screenX || 0) * dpr, oy = (window.screenY || 0) * dpr;
    try {
      const T = window.__TAURI__;
      if (T && T.window && T.window.getCurrentWindow) { const p = await T.window.getCurrentWindow().outerPosition(); if (p && typeof p.x === "number") { ox = p.x; oy = p.y; } }
    } catch (_) {}
    const sx = Math.round(ox + rect.left * dpr), sy = Math.round(oy + rect.top * dpr);
    const sw = Math.max(1, Math.round(rect.width * dpr)), sh = Math.max(1, Math.round(rect.height * dpr));
    const canvas = document.createElement("canvas");
    canvas.width = sw; canvas.height = sh;
    canvas.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    if (after) after();
    canvas.toBlob((blob) => {
      if (!blob) { setMsg("캡처 실패"); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `photocard-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMsg("저장됨 ✓ (다운로드 폴더)");
    }, "image/png");
  } catch (e) { if (after) after(); setMsg("캡처 취소/실패: " + (e && e.message ? e.message : e)); }
  finally { if (stream) stream.getTracks().forEach(t => t.stop()); }
}

// ---- 포토카드 탭 본문 (인앱 편집기) ----
function PhotocardView() {
  const cardRef = React.useRef(null);
  const idRef = React.useRef(1);
  const [color, setColor] = React.useState(PC_TEMPLATES[0].color);
  const [shape, setShape] = React.useState(PC_TEMPLATES[0].shape);
  const [items, setItems] = React.useState(PC_TEMPLATES[0].items.map(it => ({ ...it, id: idRef.current++ })));
  const [sel, setSel] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  const [chrome, setChrome] = React.useState(true);
  const [panel, setPanel] = React.useState("template");

  // 포토카드 탭에 있는 동안 항상 위 (작업 화면 위 구도)
  React.useEffect(() => { pcSetAlwaysOnTop(true); return () => pcSetAlwaysOnTop(false); }, []);

  const applyTemplate = (tpl) => { setColor(tpl.color); setShape(tpl.shape); setItems(tpl.items.map(it => ({ ...it, id: idRef.current++ }))); setSel(null); };
  const addEmoji = (ch) => { const id = idRef.current++; setItems(p => [...p, { t: "emoji", ch, x: 50, y: 30, size: 38, id }]); setSel(id); };
  const addText = () => { const t = prompt("글씨", "Lucky"); if (!t) return; const id = idRef.current++; setItems(p => [...p, { t: "text", ch: t, x: 50, y: 50, size: 20, color: "#e58aa8", id }]); setSel(id); };
  const moveItem = (e, id) => {
    e.stopPropagation(); e.preventDefault(); setSel(id);
    const rect = cardRef.current.getBoundingClientRect();
    const move = (ev) => {
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      const y = ((ev.clientY - rect.top) / rect.height) * 100;
      setItems(prev => prev.map(it => it.id === id ? { ...it, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } : it));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const resizeSel = (d) => setItems(p => p.map(it => it.id === sel ? { ...it, size: Math.max(12, Math.min(120, it.size + d)) } : it));
  const removeSel = () => { setItems(p => p.filter(it => it.id !== sel)); setSel(null); };
  const editText = (id) => { const it = items.find(x => x.id === id); const t = prompt("글씨", it.ch); if (t != null) setItems(p => p.map(x => x.id === id ? { ...x, ch: t } : x)); };
  const shoot = () => pcCapture(cardRef.current, setMsg, () => { setChrome(false); setSel(null); }, () => setChrome(true));

  const maskCss = pcCutoutMask(shape);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }} onPointerDown={() => setSel(null)}>
      {/* 카드 (본문 영역을 채움) */}
      <div ref={cardRef} style={{
        position: "absolute", left: 10, right: 10, top: 8, bottom: chrome ? 92 : 8,
        borderRadius: 18, overflow: "hidden",
        boxShadow: chrome ? "0 8px 22px rgba(0,0,0,.2)" : "none",
      }}>
        {/* 프레임(패턴) — 컷아웃 마스크로 가운데가 뚫림 */}
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(rgba(255,255,255,.85) 1.5px, transparent 1.6px) 0 0 / 13px 13px, linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 55%, white))`,
          WebkitMaskImage: maskCss, maskImage: maskCss,
          WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
        }} />
        {/* 스티커/글씨 */}
        {items.map(it => (
          <div key={it.id}
            onPointerDown={(e) => moveItem(e, it.id)}
            onDoubleClick={() => it.t === "text" ? editText(it.id) : setItems(p => p.filter(x => x.id !== it.id))}
            style={{
              position: "absolute", left: it.x + "%", top: it.y + "%", transform: "translate(-50%,-50%)",
              cursor: "grab", userSelect: "none", touchAction: "none", lineHeight: 1,
              outline: (chrome && sel === it.id) ? "1.5px dashed rgba(0,0,0,.45)" : "none", outlineOffset: 3,
              ...(it.t === "text" ? {
                fontFamily: "var(--hand)", fontWeight: 800, fontSize: it.size, color: it.color || "#e58aa8",
                textShadow: "0 1px 0 #fff, 0 0 3px #fff", whiteSpace: "nowrap",
              } : { fontSize: it.size }),
            }}>{it.ch}</div>
        ))}
      </div>

      {/* 컨트롤 (탭 본문 하단) */}
      {chrome && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 6, display: "flex", flexDirection: "column", gap: 5, alignItems: "center" }}>
          {panel === "template" && (
            <div style={pcBar}>
              {PC_TEMPLATES.map(tp => <button key={tp.id} onClick={() => applyTemplate(tp)} style={pcChip}>{tp.label}</button>)}
            </div>
          )}
          {panel === "sticker" && (
            <div style={pcBar}>
              {PC_EMOJIS.map(e => <button key={e} onClick={() => addEmoji(e)} style={{ all: "unset", cursor: "pointer", fontSize: 17, padding: "0 1px" }}>{e}</button>)}
              <span style={pcSep} /><button onClick={addText} style={pcChip}>가A</button>
            </div>
          )}
          {panel === "frame" && (
            <div style={pcBar}>
              {PC_CUTOUTS.map(o => <button key={o.id} onClick={() => setShape(o.id)} style={{ ...pcChip, background: shape === o.id ? "var(--point)" : "var(--paper)" }}>{o.label}</button>)}
              <span style={pcSep} />
              {PC_FRAME_COLORS.map(c => <button key={c} onClick={() => setColor(c)} style={{ all: "unset", cursor: "pointer", width: 15, height: 15, borderRadius: "50%", background: c, border: color === c ? "2px solid var(--ink)" : "1px solid var(--ink)" }} />)}
            </div>
          )}
          <div style={pcBar}>
            <button onClick={() => setPanel("template")} style={{ ...pcChip, background: panel === "template" ? "var(--point)" : "var(--paper)" }}>테마</button>
            <button onClick={() => setPanel("sticker")} style={{ ...pcChip, background: panel === "sticker" ? "var(--point)" : "var(--paper)" }}>스티커</button>
            <button onClick={() => setPanel("frame")} style={{ ...pcChip, background: panel === "frame" ? "var(--point)" : "var(--paper)" }}>프레임</button>
            <span style={pcSep} />
            <button onClick={() => resizeSel(-8)} disabled={!sel} style={pcMini}>－</button>
            <button onClick={() => resizeSel(8)} disabled={!sel} style={pcMini}>＋</button>
            <button onClick={removeSel} disabled={!sel} style={pcMini}>🗑</button>
            <span style={pcSep} />
            <button onClick={shoot} style={{ ...pcChip, fontWeight: 700, background: "linear-gradient(180deg, var(--point-soft), var(--point))" }}>📸</button>
          </div>
          <div className="sk-cap" style={{ fontSize: 11, maxWidth: "94%", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {msg || "스티커/글씨 더블클릭=편집·삭제 · 컷아웃에 작업화면이 비쳐요"}
          </div>
        </div>
      )}
    </div>
  );
}

const pcBar = { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "center", background: "rgba(255,255,255,0.96)", border: "1.1px solid var(--ink)", borderRadius: 99, padding: "4px 8px", boxShadow: "0 3px 10px rgba(0,0,0,.18)", maxWidth: "96%" };
const pcSep = { width: 1, height: 14, background: "var(--ink-soft)" };
const pcChip = { all: "unset", cursor: "pointer", padding: "2px 9px", borderRadius: 99, border: "1.1px solid var(--ink)", background: "var(--paper)", fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)" };
const pcMini = { all: "unset", cursor: "pointer", width: 22, height: 20, display: "grid", placeItems: "center", borderRadius: 6, border: "1.1px solid var(--ink)", background: "var(--paper)", fontSize: 12, color: "var(--ink)" };

window.PhotocardView = PhotocardView;
