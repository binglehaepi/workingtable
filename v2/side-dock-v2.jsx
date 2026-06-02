/* global React, TodayView, TodoView, MemoView, MailView, PromptView, AIView, RetroView, RoomView, SpriteIcon */
// ===========================================================
// 사이드 도크 v2 — 다이어리 인덱스 탭 + 뷰 전환
// 도크 본체 + 옆에 삐죽 나오는 종이 탭들.
// 탭 클릭 → 본문 영역 swap.
// 상단 현재 프로젝트 + 하단 타이머는 sticky (모든 탭 공통).
// ===========================================================

const { useState, useEffect } = React;

const TABS = [
  { id: "todo",  labelKey: "tab.todo",     sprite: 4,  color: "#d4ecdb", view: (ctx) => <TodoView tweaks={ctx?.tweaks} /> },
  { id: "cal",   labelKey: "tab.week",     sprite: 6,  color: "#d4e6fa", view: () => <CalendarView /> },
  { id: "memo",  labelKey: "tab.memo",     sprite: 22, color: "#fff0c0", view: () => <MemoView /> },
  { id: "mail",  labelKey: "tab.mail",     sprite: 0,  color: "#ffe0d2", view: () => <MailView /> },
  { id: "room",  labelKey: "tab.room",     sprite: 14, color: "#ecdcf5", view: (ctx) => <RoomView tweaks={ctx?.tweaks} /> },
  { id: "deco",  labelKey: "tab.deco",     sprite: 9,  color: "#ffe6f0", view: () => null, foot: true },
  { id: "settings", labelKey: "tab.settings", sprite: 1, color: "#e6e6ee", view: () => null, foot: true },
];

function SideDockV2({ tweaks, setTweak }) {
  const [active, setActive] = useState("todo");
  React.useEffect(() => {
    const onOpenMemo = () => setActive("memo");
    window.addEventListener("todoary-open-memo", onOpenMemo);
    return () => window.removeEventListener("todoary-open-memo", onOpenMemo);
  }, []);
  // 작업방 탭 표시 여부 (기본 꺼짐). 꺼지면 현재 활성 탭이 room 이었으면 todo 로 자동 전환.
  const showRoomTab = tweaks?.showRoomTab ?? true;
  const visibleTabs = showRoomTab ? TABS : TABS.filter(t => t.id !== "room");
  React.useEffect(() => {
    if (!showRoomTab && active === "room") setActive("todo");
  }, [showRoomTab, active]);
  const current = visibleTabs.find(t => t.id === active) || visibleTabs[0];
  const isPhoto = active === "photo";

  // 실제 창 높이 추적 → 짧아지면 탭을 아이콘만(짧게)으로
  const [winH, setWinH] = React.useState(typeof window !== "undefined" ? window.innerHeight : 900);
  React.useEffect(() => {
    const on = () => setWinH(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const compactTabs = winH < 640;

  const tabSide  = tweaks?.tabSide  ?? "right";
  const dockSide = tweaks?.dockSide ?? "left";
  const tabStyle = tweaks?.tabStyle ?? "paper";
  const desktopMode = tweaks?.desktopMode ?? false;
  const dockHidden = tweaks?.dockHidden ?? false;
  const tabsHidden = tweaks?.tabsHidden ?? false;

  // 도크 미니화 — 본체/탭/페이크 IDE 전부 가리고 작은 디지털 타이머 위젯만 남김.
  // 잡고 드래그로 옮길 수 있고, 클릭하면 도크 복귀.
  if (dockHidden) {
    return <DockRevealEdge tweaks={tweaks} setTweak={setTweak}
      onReveal={() => setTweak && setTweak("dockHidden", false)} />;
  }
  // 배경 (그라데이션 / 도형)
  const dockBg = buildBackground(
    tweaks?.bgType ?? "linear",
    tweaks?.bgAngle ?? 180,
    tweaks?.bgStops ?? [{ c: "#a9cdf5", p: 0 }, { c: "#ffffff", p: 100 }],
    tweaks?.bgShape ?? "none"
  );

  // 헤더·바 색 (타이틀바 / 헤더 / 인덱스 탭) — 흰색과 섞어 톤 조절
  const chrome = tweaks?.chromeColor ?? "#a9cdf5";
  const chromeGrad = tweaks?.chromeGradient ?? true;
  const chromeMix = (pct) => `color-mix(in srgb, ${chrome} ${pct}%, white)`;
  const titlebarBg = chromeGrad
    ? `linear-gradient(180deg, ${chromeMix(50)} 0%, ${chromeMix(85)} 100%)`
    : chromeMix(72);
  const headerBg = chromeGrad
    ? `linear-gradient(180deg, ${chromeMix(28)} 0%, ${chromeMix(8)} 100%)`
    : chromeMix(18);

  // 도크 측의 반대편으로 탭이 나오는 게 자연스러움
  const effectiveTabSide = dockSide === "left" ? tabSide : (tabSide === "right" ? "left" : "right");

  const DOCK_W = 380;

  return (
    <div style={{
      width: "100%", height: "100%",
      position: "relative", overflow: "hidden",
      background: desktopMode ? "transparent" : "#f5e9e2",
    }}>
      {/* 페이크 IDE 배경 — 도크 옆에 깔리는 코드 에디터 느낌 (데스크탑 모드에선 숨김) */}
      {!desktopMode && <FakeIde dockSide={dockSide} dockWidth={DOCK_W} />}

      {/* 도크 본체 */}
      <div className="dock-body" style={{
        position: "absolute", top: 0, bottom: 0,
        [dockSide]: 0,
        width: DOCK_W,
        background: (isPhoto && desktopMode) ? "transparent" : dockBg,
        borderRight:  dockSide === "left"  ? "1.1px solid var(--ink)" : "none",
        borderLeft:   dockSide === "right" ? "1.1px solid var(--ink)" : "none",
        boxShadow: dockSide === "left"
          ? "2px 0 0 var(--paper-3)"
          : "-2px 0 0 var(--paper-3)",
        display: "flex", flexDirection: "column",
        zIndex: 2,
      }}>
        <AppNotifyToast />
        {/* 글로시 스카이블루 헤더 — 드래그 영역 + 창 컨트롤 분리 (버튼은 drag 밖) */}
        <div style={{
          height: 28,
          background: titlebarBg,
          color: "var(--ink)",
          fontFamily: "var(--hand)", fontSize: 13,
          padding: "5px 10px",
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          borderBottom: "1.1px solid var(--ink)",
          userSelect: "none",
        }}>
          <div data-tauri-drag-region style={{
            flex: 1, minWidth: 0, alignSelf: "stretch",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <ProjectSwitcher />
            <div data-tauri-drag-region style={{ flex: 1, alignSelf: "stretch" }} />
          </div>
          <TitlebarWindowControls setTweak={setTweak} />
        </div>

        {/* sticky — 헤더 (제목/음악/타이머/디데이 각 한 줄) */}
        <div style={{
          padding: "9px 12px 10px",
          background: (isPhoto && desktopMode) ? "transparent" : headerBg,
          borderBottom: "1.1px solid var(--ink)",
          flexShrink: 0,
        }}>
          <HeaderDesktop />
        </div>

        {/* 본문 — 가운데 분할선 레이아웃 (각 뷰가 SplitPane로 위/아래 채움) */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {active === "settings"
            ? <SettingsView tweaks={tweaks} setTweak={setTweak} />
            : active === "deco"
              ? <DecorateView tweaks={tweaks} setTweak={setTweak} />
              : current.view({ tweaks, setTweak })}
        </div>

      </div>

      {/* 다이어리 인덱스 탭들 — 도크 본체 옆에 삐죽 */}
      <DiaryTabs
        tabs={visibleTabs}
        active={active}
        onSelect={setActive}
        dockSide={dockSide}
        tabSide={effectiveTabSide}
        dockWidth={DOCK_W}
        tabStyle={tabStyle}
        chrome={chrome}
        compact={compactTabs}
        autoHide={tabsHidden}
      />

      {/* 창 가장자리 리사이즈 핸들 — macOS decorations:false 에선 OS 가 안 깔아줌 */}
      <EdgeResizers />
    </div>
  );
}

// 가장자리 8방향 리사이즈 핸들 (보이지 않는 hit-area)
function EdgeResizers() {
  const start = (direction) => (e) => {
    if (e.button !== 0) return;
    try {
      const T = window.__TAURI__;
      if (!T || !T.window || !T.window.getCurrentWindow) return;
      e.preventDefault();
      T.window.getCurrentWindow().startResizeDragging(direction);
    } catch (_) {}
  };
  const EDGE = 5;   // 가장자리 두께
  const CRN = 10;   // 모서리 크기
  const base = { position: "absolute", zIndex: 100 };
  return (
    <>
      <div onMouseDown={start("North")}     style={{ ...base, top: 0,    left: CRN,  right: CRN,  height: EDGE, cursor: "ns-resize" }} />
      <div onMouseDown={start("South")}     style={{ ...base, bottom: 0, left: CRN,  right: CRN,  height: EDGE, cursor: "ns-resize" }} />
      <div onMouseDown={start("West")}      style={{ ...base, top: CRN,  bottom: CRN, left: 0,    width: EDGE,  cursor: "ew-resize" }} />
      <div onMouseDown={start("East")}      style={{ ...base, top: CRN,  bottom: CRN, right: 0,   width: EDGE,  cursor: "ew-resize" }} />
      <div onMouseDown={start("NorthWest")} style={{ ...base, top: 0,    left: 0,    width: CRN, height: CRN,  cursor: "nwse-resize" }} />
      <div onMouseDown={start("NorthEast")} style={{ ...base, top: 0,    right: 0,   width: CRN, height: CRN,  cursor: "nesw-resize" }} />
      <div onMouseDown={start("SouthWest")} style={{ ...base, bottom: 0, left: 0,    width: CRN, height: CRN,  cursor: "nesw-resize" }} />
      <div onMouseDown={start("SouthEast")} style={{ ...base, bottom: 0, right: 0,   width: CRN, height: CRN,  cursor: "nwse-resize" }} />
    </>
  );
}

// ---- 활성 탭 헤더 (sticky 글래스 영역) ----
function tabHeaderInfo(active, state) {
  const sel = diary.select;
  const project = sel.currentProject(state);
  switch (active) {
    case "today": {
      const notDone = sel.todosForCurrent(state).filter(t => !t.done).length;
      const minutes = sel.workMinutesToday(state);
      const unreplied = (state.emails ?? []).filter(e => !e.replied).length;
      return { ttl: `오늘 — ${diary.fmtKDate(diary.today())}`, sub: `작업 ${minutes}m · ${notDone}개 할 일 · ${unreplied}개 미답 메일` };
    }
    case "todo": {
      const items = sel.todosForCurrent(state);
      const notDone = items.filter(t => !t.done).length;
      const hot = items.filter(t => t.hot && !t.done).length;
      return { ttl: "할 일", sub: `${notDone}개 남음 · ${hot}개 급함` };
    }
    case "memo": {
      const cnt = (sel.memosForCurrent ? sel.memosForCurrent(state) : []).length;
      return { ttl: "메모", sub: `${project?.name ?? "프로젝트"} · ${cnt}개 · 자동 저장` };
    }
    case "prompt":
      return { ttl: "프롬프트 함", sub: `${(state.prompts ?? []).length}개 보관됨 · 자주 쓰는 순` };
    case "mail": {
      const unreplied = (state.emails ?? []).filter(e => !e.replied).length;
      return { ttl: "고객 문의", sub: `${unreplied}개 미답 · 답장 체크하면 자동 정리` };
    }
    case "retro":
      return { ttl: "회고", sub: "날짜별 한 개 · 자동 저장" };
    default:
      return { ttl: "", sub: "" };
  }
}

function TabHeader({ active }) {
  const { state } = diary.useDiary();
  const { ttl, sub } = tabHeaderInfo(active, state);
  return (
    <div>
      <div style={{
        fontFamily: "var(--hand)", fontSize: 15, fontWeight: 700, color: "var(--ink)",
        lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{ttl}</div>
      {sub && (
        <div className="sk-cap" style={{
          fontSize: 12, lineHeight: 1.15, marginTop: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{sub}</div>
      )}
    </div>
  );
}

// ---- 다이어리 인덱스 탭 ----
function DiaryTabs({ tabs, active, onSelect, dockSide, tabSide, dockWidth, tabStyle, chrome, compact, autoHide }) {
  const cm = (pct) => `color-mix(in srgb, ${chrome || "#a9cdf5"} ${pct}%, white)`;
  // 탭이 도크의 어느 쪽 바깥에 붙는지 → 위치 계산
  const onLeft = tabSide === "left";

  // 탭 컨테이너 위치
  const containerPos = {};
  if (dockSide === "left") {
    // 도크가 왼쪽에 있음 → 탭은 도크의 오른쪽 모서리에 붙음
    containerPos.left = dockWidth;
  } else {
    // 도크가 오른쪽에 있음 → 탭은 도크의 왼쪽 모서리에 붙음
    containerPos.right = dockWidth;
  }
  const stickRight = dockSide === "left"; // 탭이 오른쪽으로 삐쳐나옴

  const TAB_W = 32;     // 삐쳐나온 깊이
  const TAB_H = compact ? 40 : 74;   // 짧을 땐 아이콘만(낮은 탭)
  const TAB_GAP = 4;

  // ---- 자동 숨김 로직 ----
  // autoHide=true 일 때: 처음엔 숨김. 가장자리에 마우스 ~1초 호버 → 슬라이드로 노출.
  const REVEAL_DELAY = 1000;
  const HIDE_DELAY = 220;
  const [revealed, setRevealed] = useState(false);
  const revealTimerRef = React.useRef(null);
  const hideTimerRef = React.useRef(null);
  React.useEffect(() => {
    setRevealed(false);
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [autoHide]);
  const onZoneEnter = () => {
    if (!autoHide) return;
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    if (revealed) return;
    if (revealTimerRef.current) return;
    revealTimerRef.current = setTimeout(() => {
      setRevealed(true); revealTimerRef.current = null;
    }, REVEAL_DELAY);
  };
  const onZoneLeave = () => {
    if (!autoHide) return;
    if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
    if (!revealed) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setRevealed(false); hideTimerRef.current = null;
    }, HIDE_DELAY);
  };
  const hidden = autoHide && !revealed;

  const renderTab = (t) => {
    const isActive = t.id === active;
    return (
      <button
        key={t.id}
        onClick={() => onSelect(t.id)}
        style={{
          all: "unset",
          cursor: "pointer",
          width: TAB_W + (isActive ? 6 : 0),
          height: TAB_H,
          marginLeft: stickRight ? (isActive ? -4 : 0) : 0,
          marginRight: !stickRight ? (isActive ? -4 : 0) : 0,
          background: isActive ? cm(72) : cm(42),
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: "1.1px solid var(--ink)",
          borderLeft:  stickRight ? "none" : `1.1px solid var(--ink)`,
          borderRight: stickRight ? `1.1px solid var(--ink)` : "none",
          borderRadius: stickRight ? "0 12px 12px 0" : "12px 0 0 12px",
          boxShadow: stickRight ? "1.5px 1.5px 0 var(--paper-3)" : "-1.5px 1.5px 0 var(--paper-3)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 3,
          fontFamily: "var(--hand)", overflow: "hidden",
          transition: "width 0.18s, margin 0.18s, background 0.15s",
          filter: isActive ? "none" : "saturate(0.85)",
        }}
        title={L(t.labelKey)}
      >
        {t.sprite != null
          ? <SpriteIcon idx={t.sprite} size={compact ? 20 : 16} title={L(t.labelKey)} style={{ flexShrink: 0 }} />
          : <span style={{ fontSize: compact ? 18 : 15, color: "var(--ink)", flexShrink: 0 }}>{t.glyph}</span>}
        {!compact && (
          <span style={{
            writingMode: "vertical-rl", textOrientation: "mixed",
            fontSize: 11, letterSpacing: "0.01em", color: "var(--ink)",
            fontWeight: isActive ? 700 : 400,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            maxHeight: TAB_H - 24,
          }}>{L(t.labelKey)}</span>
        )}
      </button>
    );
  };

  const slideOffset = TAB_W + 8;
  const hiddenTransform = stickRight ? `translateX(-${slideOffset}px)` : `translateX(${slideOffset}px)`;
  const HOVER_ZONE_W = autoHide && !revealed ? 36 : (TAB_W + 12);

  return (
    <div
      onMouseEnter={onZoneEnter}
      onMouseLeave={onZoneLeave}
      style={{
        position: "absolute",
        top: 0, bottom: 0,
        ...containerPos,
        width: HOVER_ZONE_W,
        zIndex: 1,
        pointerEvents: "auto",
      }}
    >
      {hidden && (
        <div style={{
          position: "absolute",
          top: 72,
          [stickRight ? "left" : "right"]: 0,
          width: 3, height: 60,
          background: cm(35),
          borderRadius: stickRight ? "0 3px 3px 0" : "3px 0 0 3px",
          opacity: 0.6,
          pointerEvents: "none",
        }} />
      )}
      <div style={{
        position: "absolute",
        top: 70,
        [stickRight ? "left" : "right"]: 0,
        display: "flex", flexDirection: "column", gap: TAB_GAP,
        alignItems: stickRight ? "flex-start" : "flex-end",
        transform: hidden ? hiddenTransform : "none",
        transition: "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
        {tabs.map(renderTab)}
      </div>
    </div>
  );
}

// ---- 헤더 우측 창 컨트롤 (최소화 / 미니모드 / 종료) ----
// Tauri 창에 OS 보더가 없어서 작업표시줄 외엔 창 조작 수단이 없던 문제 해결.
function TitlebarIconButton({ onClick, title, ariaLabel, hoverStyle, children }) {
  const [hover, setHover] = useState(false);
  const hs = hover && hoverStyle ? hoverStyle : {};
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      aria-label={ariaLabel}
      style={{
        all: "unset", cursor: "pointer", flexShrink: 0,
        width: 20, height: 20, borderRadius: 4,
        display: "grid", placeItems: "center",
        fontSize: 13, lineHeight: 1,
        color: hs.color ?? "var(--ink)",
        background: hs.background ?? (hover ? "rgba(0,0,0,0.07)" : "transparent"),
        border: hs.border ?? (hover ? "1px solid var(--ink-soft)" : "1px solid transparent"),
        transition: "background 0.15s, color 0.15s, border 0.15s",
      }}
    >{children}</button>
  );
}

function MiniModeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="8" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="4.5" x2="9.5" y2="4.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function TitlebarWindowControls({ setTweak }) {
  const onMinimize = async (e) => {
    e?.stopPropagation?.();
    try {
      const T = window.__TAURI__;
      if (!T?.window?.getCurrentWindow) return;
      await T.window.getCurrentWindow().minimize();
    } catch (err) { console.warn("minimize failed:", err); }
  };
  const onMiniMode = async () => {
    if (!setTweak) return;
    try {
      const pos = window.todoarySaveNormalWindowPos && await window.todoarySaveNormalWindowPos();
      setTweak(pos
        ? { dockHidden: true, appPosX: pos.x, appPosY: pos.y, appPosPhysical: true }
        : { dockHidden: true });
    } catch (_) {
      setTweak("dockHidden", true);
    }
  };
  const onClose = async () => {
    try {
      const T = window.__TAURI__;
      if (T && T.window && T.window.getCurrentWindow) {
        await T.window.getCurrentWindow().close();
      } else if (typeof window.close === "function") {
        window.close();
      }
    } catch (e) { console.warn("close failed:", e); }
  };
  return (
    <div className="titlebar-window-controls" style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <TitlebarIconButton
        onClick={onMinimize}
        title={L("app.minimize")}
        ariaLabel={L("app.minimize")}
      >
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>_</span>
      </TitlebarIconButton>
      <TitlebarIconButton
        onClick={onMiniMode}
        title={L("app.miniMode")}
        ariaLabel={L("app.miniMode")}
      >
        <MiniModeIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        onClick={onClose}
        title={L("app.close")}
        ariaLabel={L("app.close")}
        hoverStyle={{ color: "#fff", background: "#e84545", border: "1px solid #b03030" }}
      >
        <span style={{ fontWeight: 700 }}>×</span>
      </TitlebarIconButton>
    </div>
  );
}

// ---- 도크 미니화 시 디지털 타이머 위젯 ----
// Tauri 창 자체를 위젯 크기로 줄여서 데스크탑 위 어디든 갈 수 있음.
// 위젯은 창 전체를 채우고, 외곽(time row)에 data-tauri-drag-region 을 걸어 OS 레벨로 창을 끔.
function DockRevealEdge({ tweaks, setTweak, onReveal }) {
  // 음악 상태 구독
  const [music, setMusic] = useState(
    () => window.musicPlayer ? { ...window.musicPlayer.getState() } : { playing: false, hasQueue: false }
  );
  React.useEffect(() => {
    if (!window.musicPlayer) return;
    const sync = () => setMusic({ ...window.musicPlayer.getState() });
    sync();
    return window.musicPlayer.subscribe(sync);
  }, []);

  const themeBg = buildBackground(
    tweaks?.bgType ?? "linear",
    tweaks?.bgAngle ?? 180,
    tweaks?.bgStops ?? [{ c: "#a9cdf5", p: 0 }, { c: "#ffffff", p: 100 }],
    tweaks?.bgShape ?? "none"
  );
  const onPrev   = () => { try { window.musicPlayer && window.musicPlayer.prev(); } catch (_) {} };
  const onToggle = () => { try { window.musicPlayer && window.musicPlayer.toggle(); } catch (_) {} };
  const onNext   = () => { try { window.musicPlayer && window.musicPlayer.next(); } catch (_) {} };

  const iconBtn = {
    all: "unset", cursor: "pointer", flexShrink: 0,
    width: 20, height: 20, borderRadius: 4,
    display: "grid", placeItems: "center",
    fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1, color: "var(--ink)",
    background: "rgba(255,255,255,0.4)",
    border: "1px solid var(--ink-soft)",
  };
  const disabledBtn = { ...iconBtn, cursor: "default", opacity: 0.35 };
  const miniSize = (window.TODOARY_DOCK_MINI && window.TODOARY_DOCK_MINI.getSize)
    ? window.TODOARY_DOCK_MINI.getSize()
    : { w: 148, h: 78 };
  const WIDGET_W = miniSize.w;
  const WIDGET_H = miniSize.h;
  const WorkChip = window.WorkTimeUI && window.WorkTimeUI.WorkTimeChip;

  return (
    <div title={L("set.dockMiniTip")} style={{
      position: "fixed", top: 0, left: 0,
      width: WIDGET_W, height: WIDGET_H,
      background: themeBg, backgroundSize: "200% 200%", backgroundPosition: "center",
      border: "1.1px solid var(--ink)", borderRadius: 10, boxSizing: "border-box",
      boxShadow: "inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -1px 1px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.18)",
      display: "flex", flexDirection: "column",
      userSelect: "none", overflow: "visible",
      color: "var(--ink)", fontFamily: "var(--mono)",
      textShadow: "0 1px 0 rgba(255,255,255,0.55)",
      zIndex: 9999,
    }}>
      <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "visible" }}>
        <div data-tauri-drag-region style={{ position: "absolute", inset: 0, cursor: "grab" }} />
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          pointerEvents: "none",
        }}>
          <span style={{ fontSize: 12, opacity: 0.65, textShadow: "none" }}>⏱</span>
          {WorkChip ? (
            <div style={{ pointerEvents: "auto", position: "relative", zIndex: 2 }}>
              <WorkChip compact showStatus={false} />
            </div>
          ) : null}
        </div>
        <button onClick={onReveal} title={L("set.dockReveal")} aria-label={L("set.dockReveal")}
          style={{
            all: "unset", cursor: "pointer",
            position: "absolute", top: 4, right: 4,
            width: 22, height: 22, borderRadius: 5,
            display: "grid", placeItems: "center",
            fontSize: 13, fontWeight: 700, lineHeight: 1, color: "var(--ink)",
            background: "rgba(255,255,255,0.55)",
            border: "1px solid var(--ink-soft)",
            zIndex: 2,
          }}>⤢</button>
      </div>
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "4px 8px 6px",
        borderTop: "1px solid rgba(0,0,0,0.1)",
        background: "rgba(255,255,255,0.22)",
      }}>
        <button onClick={onPrev} title={L("music.prev")} style={music.hasQueue ? iconBtn : disabledBtn} disabled={!music.hasQueue}>⏮</button>
        <button onClick={onToggle} title={music.playing ? L("music.pause") : L("music.play")} style={music.hasQueue ? iconBtn : disabledBtn} disabled={!music.hasQueue}>{music.playing ? "⏸" : "▶"}</button>
        <button onClick={onNext} title={L("music.next")} style={music.hasQueue ? iconBtn : disabledBtn} disabled={!music.hasQueue}>⏭</button>
      </div>
    </div>
  );
}

// ---- 페이크 IDE 배경 ----
function FakeIde({ dockSide, dockWidth }) {
  const ideStyle = {
    position: "absolute", top: 0, bottom: 24,
    [dockSide === "left" ? "left" : "right"]: dockWidth,
    [dockSide === "left" ? "right" : "left"]: 0,
    background: "var(--paper-2)",
    color: "var(--ink-2)",
    fontFamily: "var(--mono)", fontSize: 11,
    padding: "30px 24px",
    overflow: "hidden",
  };
  return (
    <>
      <div className="fake-ide" style={ideStyle}>
        <div style={{ color: "var(--ink-3)", marginBottom: 16, fontFamily: "var(--hand-2)", fontSize: 15 }}>✿ 이건 참고용 페이크 IDE — 다이어리가 실제로 어디 도킹되는지 보여주려고</div>
        <div style={{ color: "var(--ink)" }}>todoary / src / components / Timer.tsx</div>
        <pre style={{ color: "var(--ink-2)", lineHeight: 1.65, marginTop: 14 }}>
{`export function Timer({ minutes = 25 }) {
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => {
    const id = setInterval(() => setLeft(s => s - 1), 1000);
    return () => clearInterval(id);
  }, []);

  // TODO: 알림 권한 / 사운드 옵션 토글
  return (
    <div className="timer">
      {format(left)}
    </div>
  );
}`}
        </pre>
      </div>
      {/* 페이크 작업표시줄 */}
      <div className="xp-taskbar fake-taskbar" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 24, fontSize: 11, padding: "3px 8px" }}>
        <span className="xp-start" style={{ fontSize: 11, padding: "1px 12px 2px 10px" }}>start ♡</span>
        <span style={{ color: "var(--ink-2)" }}>VS Code</span>
        <span style={{ color: "var(--ink-3)" }}>|</span>
        <span style={{
          background: "var(--pink)", color: "var(--ink)",
          padding: "1px 10px", borderRadius: 99,
          fontFamily: "var(--hand)", fontSize: 11,
          border: "1.1px solid var(--ink)",
        }}>♡ 다이어리</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)" }}>14:23 · 다음 스트레칭 23m</span>
      </div>
    </>
  );
}

// ===========================================================
// 앱 내 알림 토스트 (뽀모도로 등 — OS 알림 실패 시에도 표시)
// ===========================================================
function AppNotifyToast() {
  const [msg, setMsg] = useState(null);
  useI18n();
  useEffect(() => {
    let timerId = null;
    const h = (e) => {
      const { title, body } = e.detail || {};
      const text = body ? `${title} — ${body}` : (title || "");
      if (!text) return;
      setMsg(text);
      clearTimeout(timerId);
      timerId = setTimeout(() => setMsg(null), 4200);
    };
    window.addEventListener("app-notify", h);
    return () => {
      window.removeEventListener("app-notify", h);
      clearTimeout(timerId);
    };
  }, []);
  if (!msg) return null;
  return (
    <div style={{
      position: "absolute", top: 34, left: 10, right: 10, zIndex: 50,
      padding: "8px 10px", borderRadius: 10,
      border: "1.1px solid var(--ink)", background: "var(--paper)",
      boxShadow: "0 3px 0 var(--paper-3)",
      fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
      pointerEvents: "none",
    }}>{msg}</div>
  );
}

// ===========================================================
// 헤더 — 제목/음악/타이머/디데이 각 한 줄 (별도 창 크롬 없음)
// ===========================================================
function HeaderDesktop() {
  return <Timer />;
}

// ===========================================================
// 설정 — 커스터마이징 (포인트 컬러 / 도크 위치 / 탭 방향 / 투명모드 / 초기화)
// ===========================================================
function SettingsView({ tweaks, setTweak }) {
  const t = tweaks || {};
  const set = setTweak || (() => {});
  const i18 = useI18n();
  const [langOpen, setLangOpen] = useState(false);
  const currentLang = i18.list().find(([code]) => code === i18.get()) || i18.list()[0];
  return (
    <div style={{ height: "100%", overflowY: "auto", overflowX: "hidden", padding: "14px 16px" }}>
      <SetSection label={L("set.lang")}>
        <button onClick={() => setLangOpen(o => !o)} style={{
          all: "unset", cursor: "pointer", boxSizing: "border-box", width: "100%",
          padding: "7px 9px", borderRadius: 10,
          border: "1.1px solid var(--ink)",
          background: "rgba(255,255,255,0.68)", color: "var(--ink)",
          display: "flex", alignItems: "center", gap: 7,
        }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 800 }}>{currentLang?.[2] || i18.get().toUpperCase()}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--hand)", fontSize: 13 }}>{currentLang?.[1] || i18.get()}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{langOpen ? "▴" : "▾"}</span>
        </button>
        {langOpen && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 7 }}>
            {i18.list().map(([code, name, short]) => {
              const active = i18.get() === code;
              return (
                <button key={code} onClick={() => { i18.set(code); setLangOpen(false); }} style={{
                  all: "unset", cursor: "pointer", boxSizing: "border-box",
                  minWidth: 0, padding: "6px 8px", borderRadius: 10,
                  border: active ? "1.2px solid var(--ink)" : "1px solid var(--ink-soft)",
                  background: active ? "var(--hi)" : "rgba(255,255,255,0.62)",
                  color: "var(--ink)",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{
                    flexShrink: 0, minWidth: 24, textAlign: "center",
                    fontFamily: "var(--mono)", fontSize: 10, fontWeight: 800,
                    padding: "1px 4px", borderRadius: 99,
                    background: active ? "rgba(255,255,255,0.72)" : "var(--paper)",
                    border: "1px solid rgba(40,51,63,0.18)",
                  }}>{short || code.toUpperCase()}</span>
                  <span style={{
                    minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontFamily: "var(--hand)", fontSize: 12.5,
                  }}>{name}</span>
                </button>
              );
            })}
          </div>
        )}
      </SetSection>

      <SetSection label={L("set.size")}>
        <SetSeg value={t.appSize ?? "normal"} onChange={v => set("appSize", v)}
          options={[["normal", L("set.sizeNormal")], ["medium", L("set.sizeMedium")], ["compact", L("set.sizeCompact")]]} />
      </SetSection>

      <SetSection label={L("set.dock")}>
        <SetSeg value={t.dockSide ?? "left"} onChange={v => set("dockSide", v)}
          options={[["left", L("set.left")], ["right", L("set.right")]]} />
      </SetSection>

      <SetSection label={L("set.alwaysOnTop")}>
        <SetSeg value={t.alwaysOnTop ? "on" : "off"} onChange={v => set("alwaysOnTop", v === "on")}
          options={[["on", L("set.on")], ["off", L("set.off")]]} />
        <div className="sk-cap" style={{ marginTop: 6, fontSize: 11 }}>{L("set.alwaysOnTopHint")}</div>
      </SetSection>

      <SetSection label={L("set.roomTab")}>
        <SetSeg value={(t.showRoomTab ?? true) ? "on" : "off"} onChange={v => set("showRoomTab", v === "on")}
          options={[["on", L("set.on")], ["off", L("set.off")]]} />
        <div className="sk-cap" style={{ marginTop: 6, fontSize: 11 }}>{L("set.roomTabHint")}</div>
      </SetSection>

      <SetSection label={L("set.pomodoro")}>
        <SetSeg value={(t.showPomodoro ?? true) ? "on" : "off"} onChange={v => set("showPomodoro", v === "on")}
          options={[["on", L("set.on")], ["off", L("set.off")]]} />
        <div className="sk-cap" style={{ marginTop: 6, fontSize: 11 }}>{L("set.pomodoroHint")}</div>
      </SetSection>

      <SetSection label={L("set.dockHide")}>
        <SetSeg value={t.dockHidden ? "on" : "off"} onChange={async v => {
          if (v === "on") {
            try {
              const pos = window.todoarySaveNormalWindowPos && await window.todoarySaveNormalWindowPos();
              set(pos
                ? { dockHidden: true, appPosX: pos.x, appPosY: pos.y, appPosPhysical: true }
                : { dockHidden: true });
            } catch (_) {
              set("dockHidden", true);
            }
          } else {
            set("dockHidden", false);
          }
        }}
          options={[["on", L("set.on")], ["off", L("set.off")]]} />
        <div className="sk-cap" style={{ marginTop: 6, fontSize: 11 }}>{L("set.dockHideHint")}</div>
      </SetSection>

      <SetSection label={L("set.tabsAutoHide")}>
        <SetSeg value={t.tabsHidden ? "on" : "off"} onChange={v => set("tabsHidden", v === "on")}
          options={[["on", L("set.on")], ["off", L("set.off")]]} />
        <div className="sk-cap" style={{ marginTop: 6, fontSize: 11 }}>{L("set.tabsAutoHideHint")}</div>
      </SetSection>

      {typeof window.RoomDevSandboxPanel === "function" && (
        <SetSection label="작업방 개발 테스트 (이 PC만)">
          <RoomDevSandboxPanel />
        </SetSection>
      )}

      <SetSection label={L("set.data")}>
        <button onClick={() => diary.actions.hardReset()} style={{
          all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box",
          textAlign: "center", padding: "8px 12px", borderRadius: 10,
          border: "1.1px solid var(--ink)", background: "var(--bad)", color: "#fff",
          fontFamily: "var(--hand)", fontWeight: 700, fontSize: 14,
        }}>{L("set.reset")}</button>
        <div className="sk-cap" style={{ marginTop: 6, fontSize: 12 }}>{L("set.resetCaption")}</div>
      </SetSection>
    </div>
  );
}

// ===========================================================
// 꾸미기 — 테마 / 포인트 컬러 / 그라데이션 편집기 (다중 색 스탑)
// ===========================================================
const DECO_THEMES = [
  { nameKey: "th.basic",    type: "linear", angle: 180, chrome: "#a9cdf5", stops: [{ c: "#a9cdf5", p: 0 }, { c: "#ffffff", p: 100 }] },
  { nameKey: "th.melon",    type: "linear", angle: 180, chrome: "#9ef0c4", stops: [{ c: "#9ef0c4", p: 0 }, { c: "#d9f7ea", p: 50 }, { c: "#ffffff", p: 100 }] },
  { nameKey: "th.summer",   type: "linear", angle: 180, chrome: "#7fd8f0", stops: [{ c: "#7fd8f0", p: 0 }, { c: "#bafff0", p: 40 }, { c: "#fff7c0", p: 100 }] },
  { nameKey: "th.green",    type: "linear", angle: 180, chrome: "#bce98f", stops: [{ c: "#bce98f", p: 0 }, { c: "#e2f6cf", p: 55 }, { c: "#ffffff", p: 100 }] },
  { nameKey: "th.milk",     type: "radial", angle: 180, chrome: "#ffb3c8", stops: [{ c: "#ffb3c8", p: 0 }, { c: "#ffe3ec", p: 55 }, { c: "#fff6f0", p: 100 }] },
  { nameKey: "th.peach",    type: "linear", angle: 180, chrome: "#ffd9c2", stops: [{ c: "#ffd9c2", p: 0 }, { c: "#fff0e6", p: 55 }, { c: "#ffffff", p: 100 }] },
  { nameKey: "th.lavender", type: "radial", angle: 180, chrome: "#d8cdf5", stops: [{ c: "#d8cdf5", p: 0 }, { c: "#ece6fb", p: 55 }, { c: "#ffffff", p: 100 }] },
  { nameKey: "th.night",    type: "linear", angle: 180, chrome: "#8aa0c8", stops: [{ c: "#3a4a6b", p: 0 }, { c: "#8aa0c8", p: 60 }, { c: "#e3eefc", p: 100 }] },
];
const DECO_PALETTE = [
  "#a9cdf5", "#7fb5f0", "#5b8fd6", "#7fd8f0", "#5ec8e0", "#bafff0",
  "#aef0c8", "#9ef0c4", "#bce98f", "#a3d977", "#fdff85", "#fff0a0",
  "#ffe3a0", "#ffd3b6", "#ffb38a", "#ffb3c8", "#ff9bb3", "#ffc7d4",
  "#f7a8c4", "#d8cdf5", "#b9a3e8", "#c8dffb", "#cfd6e0", "#9aa7b8",
  "#3a4a6b", "#28333f", "#1c1c1c", "#ffffff",
];
const DECO_ACCENTS = ["#fdff85", "#ffc7d4", "#c5e8d4", "#c8dffb", "#d8cdf5", "#ffd3b6", "#bafff0", "#ffb38a"];
const DECO_DIRS = [["↖", 315], ["↑", 0], ["↗", 45], ["←", 270], ["↓", 180], ["→", 90], ["↙", 225], ["↘", 135]];

function DecorateView({ tweaks, setTweak }) {
  const t = tweaks || {};
  const set = setTweak || (() => {});
  const bgType = t.bgType ?? "linear";
  const bgAngle = t.bgAngle ?? 180;
  const bgShape = t.bgShape ?? "none";
  const stops = t.bgStops ?? [{ c: "#a9cdf5", p: 0 }, { c: "#ffffff", p: 100 }];
  const previewBg = buildBackground(bgType, bgAngle, stops, bgShape);

  const setStops = (next) => set("bgStops", next);
  const updColor = (i, c) => setStops(stops.map((s, idx) => idx === i ? { ...s, c } : s));
  const updPos = (i, p) => setStops(stops.map((s, idx) => idx === i ? { ...s, p } : s));
  const addStop = () => { if (stops.length >= 4) return; const n = [...stops]; n.splice(n.length - 1, 0, { c: "#ffd3b6", p: 50 }); setStops(n); };
  const removeStop = (i) => { if (stops.length <= 2) return; setStops(stops.filter((_, idx) => idx !== i)); };
  const applyTheme = (th) => {
    set("bgType", th.type); set("bgAngle", th.angle); set("bgStops", th.stops);
    if (th.chrome) set("chromeColor", th.chrome);
    if (th.accent) { set("tabAccent", th.accent); document.documentElement.style.setProperty("--hi", th.accent); }
  };
  useI18n();
  const myThemes = t.myThemes ?? [];
  const saveMyTheme = async () => {
    const name = window.dialog
      ? await window.dialog.prompt(L("deco.saveName"), L("deco.myThemeName") + (myThemes.length + 1))
      : prompt(L("deco.saveName"), L("deco.myThemeName") + (myThemes.length + 1));
    if (!name?.trim()) return;
    const cur = { name: name.trim(), type: bgType, angle: bgAngle, stops, chrome: t.chromeColor ?? "#a9cdf5", accent: t.tabAccent };
    set("myThemes", [...myThemes, cur]);
  };
  const delMyTheme = (i) => set("myThemes", myThemes.filter((_, idx) => idx !== i));
  const [sec, setSec] = useState("theme");

  const themeBtn = (th, i, mine) => (
    <div key={i} style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1.1px solid var(--ink)" }}>
      <button onClick={() => applyTheme(th)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
        <div style={{ height: 34, background: buildGradient(th.type, th.angle, th.stops) }} />
        <div style={{ padding: mine ? "3px 16px 3px 6px" : "3px 6px", textAlign: mine ? "left" : "center", fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink)", background: "var(--paper)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mine ? th.name : L(th.nameKey)}</div>
      </button>
      {mine && (
        <button onClick={() => delMyTheme(i)} title={L("common.delete")} style={{
          all: "unset", cursor: "pointer", position: "absolute", top: 2, right: 2,
          width: 16, height: 16, borderRadius: "50%", display: "grid", placeItems: "center",
          background: "rgba(255,255,255,0.85)", border: "1px solid var(--ink)", fontSize: 9, color: "var(--ink)",
        }}>✕</button>
      )}
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* 상단 세그먼트 */}
      <div style={{ padding: "12px 14px 8px", flexShrink: 0 }}>
        <SegTabs value={sec} onChange={setSec} options={[["theme", L("deco.theme")], ["bg", L("deco.bg")], ["color", L("deco.color")]]} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "4px 14px 16px" }}>
        {/* ── 테마 ── */}
        {sec === "theme" && (
          <>
            <SetSection label={L("deco.baseTheme")}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                {DECO_THEMES.map((th, i) => themeBtn(th, th.nameKey, false))}
              </div>
            </SetSection>
            <SetSection label={`${L("deco.myTheme")} · ${myThemes.length}`}>
              {myThemes.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 8 }}>
                  {myThemes.map((th, i) => themeBtn(th, i, true))}
                </div>
              )}
              <button onClick={saveMyTheme} style={{
                all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", textAlign: "center",
                padding: "8px", borderRadius: 10,
                border: "1.1px solid var(--ink)", background: "linear-gradient(180deg, var(--point-soft), var(--point))",
                fontFamily: "var(--hand)", fontWeight: 700, fontSize: 13, color: "var(--ink)",
              }}>{L("deco.save")}</button>
            </SetSection>
          </>
        )}

        {/* ── 배경 ── */}
        {sec === "bg" && (
          <>
            <SetSection label={L("deco.preview")}>
              <div style={{ height: 64, borderRadius: 10, border: "1.1px solid var(--ink)", background: previewBg }} />
            </SetSection>
            <SetSection label={L("deco.type")}>
              <SetSeg value={bgType} onChange={v => set("bgType", v)} options={[["linear", L("deco.linear")], ["radial", L("deco.radial")]]} />
            </SetSection>
            <SetSection label={L("deco.shape")}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[["none", "deco.shapeNone"], ["heart", "deco.shapeHeart"], ["hearts", "deco.shapeHearts"], ["stars", "deco.shapeStars"], ["clover", "deco.shapeClover"], ["ribbon", "deco.shapeRibbon"], ["fish", "deco.shapeFish"]].map(([v, k]) => (
                  <button key={v} onClick={() => set("bgShape", v)} style={{
                    all: "unset", cursor: "pointer", padding: "5px 12px", borderRadius: 99,
                    border: "1.1px solid var(--ink)", background: bgShape === v ? "var(--hi)" : "var(--paper)",
                    fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
                  }}>{L(k)}</button>
                ))}
              </div>
            </SetSection>
            {bgShape === "none" && bgType === "linear" && (
              <SetSection label={L("deco.dir")}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                  {DECO_DIRS.map(([a, ang]) => (
                    <button key={ang} onClick={() => set("bgAngle", ang)} style={{
                      all: "unset", cursor: "pointer", height: 30, borderRadius: 7,
                      display: "grid", placeItems: "center", fontSize: 15,
                      border: "1.1px solid var(--ink)", background: bgAngle === ang ? "var(--hi)" : "var(--paper)", color: "var(--ink)",
                    }}>{a}</button>
                  ))}
                </div>
              </SetSection>
            )}
            <SetSection label={`${L("deco.stops")} · ${stops.length}`}>
              {stops.map((s, i) => (
                <StopRow key={i} stop={s} palette={DECO_PALETTE}
                  onColor={c => updColor(i, c)} onPos={p => updPos(i, p)}
                  onRemove={() => removeStop(i)} canRemove={stops.length > 2} />
              ))}
              {stops.length < 4 && (
                <button onClick={addStop} style={{
                  all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", textAlign: "center",
                  padding: "6px", borderRadius: 8, border: "1.1px dashed var(--ink-2)", marginTop: 4,
                  fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink-2)",
                }}>{L("deco.addColor")}</button>
              )}
            </SetSection>
          </>
        )}

        {/* ── 색상 ── */}
        {sec === "color" && (
          <>
            <SetSection label={L("deco.point")}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {DECO_ACCENTS.map(c => (
                  <button key={c} onClick={() => { applyAccent(c); set("tabAccent", c); }} style={{
                    all: "unset", cursor: "pointer", width: 30, height: 30, borderRadius: "50%", background: c,
                    border: t.tabAccent === c ? "2.6px solid var(--ink)" : "1.1px solid var(--ink)",
                    boxShadow: t.tabAccent === c ? "0 0 0 2px var(--paper-3)" : "none",
                  }} />
                ))}
                <ColorPick value={t.tabAccent ?? "#fdff85"} onChange={c => { applyAccent(c); set("tabAccent", c); }} round />
              </div>
            </SetSection>
            <SetSection label={L("deco.chrome")}>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                {DECO_PALETTE.map(c => (
                  <button key={c} onClick={() => set("chromeColor", c)} style={{
                    all: "unset", cursor: "pointer", width: 24, height: 24, borderRadius: 6, background: c,
                    border: (t.chromeColor ?? "#a9cdf5") === c ? "2.6px solid var(--ink)" : "1.1px solid var(--ink)",
                    boxShadow: (t.chromeColor ?? "#a9cdf5") === c ? "0 0 0 2px var(--paper-3)" : "none",
                  }} />
                ))}
                <ColorPick value={t.chromeColor ?? "#a9cdf5"} onChange={c => set("chromeColor", c)} />
              </div>
            </SetSection>
            <SetSection label={L("deco.headerGrad")}>
              <SetSeg value={(t.chromeGradient ?? true) ? "on" : "off"} onChange={v => set("chromeGradient", v === "on")}
                options={[["on", L("set.on")], ["off", L("set.off")]]} />
            </SetSection>
          </>
        )}
      </div>
    </div>
  );
}

// 꾸미기 상단 세그먼트 (테마 / 배경 / 색상)
function SegTabs({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--paper-2)", borderRadius: 99, padding: 3, border: "1.1px solid var(--ink)" }}>
      {options.map(([v, lbl]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          all: "unset", cursor: "pointer", flex: 1, textAlign: "center", padding: "5px 0", borderRadius: 99,
          background: value === v ? "var(--hi)" : "transparent",
          fontFamily: "var(--hand)", fontSize: 13, fontWeight: value === v ? 700 : 400, color: "var(--ink)",
        }}>{lbl}</button>
      ))}
    </div>
  );
}

function StopRow({ stop, palette, onColor, onPos, onRemove, canRemove }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setOpen(o => !o)} title="색 선택" style={{
          all: "unset", cursor: "pointer", width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: stop.c, border: "1.1px solid var(--ink)",
        }} />
        <input type="range" min="0" max="100" value={stop.p} onChange={e => onPos(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--ink)" }} />
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, width: 34, textAlign: "right", color: "var(--ink-2)" }}>{stop.p}%</span>
        {canRemove && <button onClick={onRemove} title={L("common.delete")} style={{ all: "unset", cursor: "pointer", color: "var(--ink-3)", fontSize: 13, padding: "0 2px" }}>✕</button>}
      </div>
      {open && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, padding: 6, border: "1px solid var(--ink-soft)", borderRadius: 8, background: "var(--paper)", alignItems: "center" }}>
          {palette.map(c => (
            <button key={c} onClick={() => { onColor(c); }} style={{
              all: "unset", cursor: "pointer", width: 22, height: 22, borderRadius: 5, background: c,
              border: stop.c === c ? "2px solid var(--ink)" : "1px solid var(--ink-soft)",
            }} />
          ))}
          <ColorPick value={stop.c} onChange={onColor} />
        </div>
      )}
    </div>
  );
}

// 직접 색 선택 (네이티브 컬러 피커)
function ColorPick({ value, onChange, round }) {
  return (
    <label title="직접 색 선택" style={{
      position: "relative", cursor: "pointer",
      width: round ? 30 : 22, height: round ? 30 : 22,
      borderRadius: round ? "50%" : 5, overflow: "hidden",
      border: "1.1px dashed var(--ink)",
      display: "inline-grid", placeItems: "center",
      background: "conic-gradient(from 0deg, #ff5e5e, #ffe14d, #6dff6d, #4de1ff, #6d6dff, #ff5edb, #ff5e5e)",
    }}>
      <span style={{ fontSize: 11, color: "#fff", textShadow: "0 0 2px rgba(0,0,0,.7)", fontWeight: 700 }}>＋</span>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: "none", padding: 0 }} />
    </label>
  );
}

function SetSection({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="sk-label" style={{ marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

function SetSeg({ value, onChange, options }) {
  return (
    <div style={{ display: "inline-flex", borderRadius: 99, border: "1.1px solid var(--ink)", overflow: "hidden" }}>
      {options.map(([v, lbl], i) => (
        <button key={v} onClick={() => onChange(v)} style={{
          all: "unset", cursor: "pointer", padding: "5px 16px",
          borderLeft: i ? "1.1px solid var(--ink)" : "none",
          background: value === v ? "var(--hi)" : "var(--paper)",
          fontFamily: "var(--hand)", fontSize: 13, color: "var(--ink)",
        }}>{lbl}</button>
      ))}
    </div>
  );
}

// ===========================================================
// 키보드형 입력창 — 탭 맥락에 맞춰 빠르게 추가
// ===========================================================
function KeyboardInput({ active }) {
  const { state, actions } = diary.useDiary();
  const [v, setV] = useState("");

  const CFG = {
    todo:  { ph: "할 일 추가…  (Enter 저장 · Shift+Enter 줄바꿈)",      add: (t) => actions.addTodo(t) },
    memo:  { ph: "메모 추가…  (Enter 저장 · Shift+Enter 줄바꿈)",       add: (t) => actions.addMemo({ body: t }) },
    mail:  { ph: "받은 메일 붙여넣고 Enter…  (Shift+Enter 줄바꿈)",     add: (t) => actions.addInquiry({ subject: t.split("\n")[0].slice(0, 60), body: t }) },
    cal:   { ph: "이 날짜에 메모 추가…  (Enter 저장)",                  add: (t) => actions.appendNote(state.selectedDate || diary.today(), t) },
  };
  const cfg = CFG[active] || CFG.todo;

  const submit = () => {
    const t = v.trim();
    if (!t) return;
    cfg.add(t);
    setV("");
  };
  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
      <div className="kbd-cap" style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 7, padding: "8px 12px" }}>
        <span style={{ fontSize: 15, color: "var(--ink-2)", flexShrink: 0, marginTop: 2 }}>⌨</span>
        <textarea
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={onKey}
          placeholder={cfg.ph}
          rows={3}
          style={{
            flex: 1, border: 0, outline: "none", background: "transparent", resize: "none",
            fontFamily: "var(--hand)", fontSize: 15, color: "var(--ink)", lineHeight: 1.35,
          }}
        />
      </div>
      <button onClick={submit} className="kbd-cap kbd-enter" title="추가 (Enter)" style={{
        width: 58, display: "grid", placeItems: "center",
        fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, color: "var(--ink)",
        cursor: "pointer",
      }}>⏎</button>
    </div>
  );
}

// 모니터/키보드 전용 CSS (한 번만 주입)
if (!document.getElementById("monitor-kbd-css")) {
  const s = document.createElement("style");
  s.id = "monitor-kbd-css";
  s.textContent = `
    .kbd-cap {
      background: linear-gradient(180deg, #ffffff 0%, #e7edf4 100%);
      border: 1.1px solid var(--ink);
      border-radius: 9px;
      box-shadow: 0 2px 0 #97a6b8, inset 0 1px 0 rgba(255,255,255,0.9);
      min-height: 34px;
      transition: transform .04s, box-shadow .04s;
    }
    .kbd-cap:active {
      transform: translateY(2px);
      box-shadow: 0 0 0 #97a6b8, inset 0 1px 0 rgba(255,255,255,0.9);
    }
    .kbd-enter {
      background: linear-gradient(180deg, var(--point-soft) 0%, var(--point) 100%);
    }
    .kbd-cap-mini {
      display: inline-grid; place-items: center;
      min-width: 26px; height: 17px; padding: 0 5px;
      background: linear-gradient(180deg, #eef2f7, #d4dce6);
      border: 1px solid #6c7a8c; border-radius: 5px;
      box-shadow: 0 1.5px 0 #97a6b8;
      font-family: var(--mono); font-size: 9px; color: #46566b;
    }
  `;
  document.head.appendChild(s);
}

window.HeaderDesktop = HeaderDesktop;
window.SettingsView = SettingsView;
window.DecorateView = DecorateView;
window.KeyboardInput = KeyboardInput;
window.SideDockV2 = SideDockV2;
