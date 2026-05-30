/* global React, diary, L */
// ===========================================================
// 다이어리팩 — "오른쪽 페이지" (월간 다이어리)
//   도크를 책처럼 옆으로 펼치면 나타나는 별도 페이지.
//   월간 격자 → 날짜 클릭 → 그 날의 완료한 할 일(자동) · 기분 스탬프 1개 · 하루 메모.
//   데이터는 기존 주간탭 하루 상세와 100% 공유한다 (retros 의 text/mood, dayBundle 의 할 일).
//   self-contained 확장 모듈: 전역(diary, L)만 의존하고 view-today.jsx 는 건드리지 않음.
//   ⚠ 기분 스프라이트 상수는 view-today.jsx 와 동일한 정의를 의도적으로 복제 (모듈 독립성).
// ===========================================================
const { useState: dpUseState, useEffect: dpUseEffect, useRef: dpUseRef } = React;

// ---- 날짜 유틸 ----
function dpPad2(n) { return String(n).padStart(2, "0"); }
function dpDateOnly(d) { return `${d.getFullYear()}-${dpPad2(d.getMonth() + 1)}-${dpPad2(d.getDate())}`; }
function dpParse(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }

// ---- 기분 스프라이트 (asset/Sprite-0002.png · 6x4 · 16x16 타일) ----
const DP_SPRITE_URL = "asset/Sprite-0002.png";
const DP_SPRITE_COLS = 6;
const DP_SPRITE_ROWS = 4;
const DP_TILE = 16;
const DP_MOODS = [
  { id: "great",  label: "반짝", col: 1, row: 0 },
  { id: "happy",  label: "좋아", col: 0, row: 1 },
  { id: "love",   label: "두근", col: 0, row: 0 },
  { id: "calm",   label: "잔잔", col: 5, row: 1 },
  { id: "soso",   label: "그저", col: 1, row: 1 },
  { id: "tired",  label: "지침", col: 4, row: 1 },
  { id: "sad",    label: "울적", col: 2, row: 1 },
  { id: "stress", label: "꽉참", col: 2, row: 0 },
];
function DpMoodIcon({ mood, size = 18 }) {
  const m = DP_MOODS.find(x => x.id === mood);
  if (!m) return null;
  const scale = size / DP_TILE;
  return (
    <span style={{
      display: "inline-block", width: size, height: size, flexShrink: 0,
      backgroundImage: `url(${DP_SPRITE_URL})`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: `-${m.col * DP_TILE * scale}px -${m.row * DP_TILE * scale}px`,
      backgroundSize: `${DP_SPRITE_COLS * DP_TILE * scale}px ${DP_SPRITE_ROWS * DP_TILE * scale}px`,
      imageRendering: "pixelated",
    }} />
  );
}

// ---- 언어별 라벨 ----
const DP_WEEK = {
  ko: ["일","월","화","수","목","금","토"],
  en: ["S","M","T","W","T","F","S"],
  zh: ["日","一","二","三","四","五","六"],
  ja: ["日","月","火","水","木","金","土"],
};
const DP_EN_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function dpLang() { return (window.i18n && window.i18n.get && window.i18n.get()) || "ko"; }
function dpMonthTitle(y, m /* 0-indexed */) {
  const lng = dpLang();
  if (lng === "en") return `${DP_EN_MONTHS[m]} ${y}`;
  if (lng === "ja" || lng === "zh") return `${y}年${m + 1}月`;
  return `${y}년 ${m + 1}월`;
}
function dpWeekdayLabel(dow /* 0=일 */) {
  const lng = dpLang();
  const ko = ["일","월","화","수","목","금","토"];
  return (DP_WEEK[lng] || DP_WEEK.ko)[dow] + (lng === "ko" ? "요일" : "");
}

// ---- 공통 버튼 스타일 (주간탭과 톤 일치) ----
const dpNavBtn = {
  all: "unset", cursor: "pointer",
  width: 26, height: 22, borderRadius: 5,
  display: "grid", placeItems: "center",
  fontSize: 11, color: "var(--ink)",
  background: "linear-gradient(180deg, color-mix(in srgb, var(--chrome,#a9cdf5) 42%, white) 0%, color-mix(in srgb, var(--chrome,#a9cdf5) 12%, white) 100%)",
  border: "1.1px solid var(--ink)",
  boxShadow: "0 1px 0 var(--paper-3)",
};
const dpPillBtn = {
  all: "unset", cursor: "pointer",
  padding: "2px 9px", borderRadius: 99,
  fontFamily: "var(--hand)", fontSize: 11, color: "var(--ink)",
  border: "1.1px solid var(--ink)", background: "var(--paper)",
};

// ===========================================================
// 메인 — 오른쪽 페이지
// ===========================================================
function DiaryPackPage({ onClose }) {
  const { state, actions } = diary.useDiary();
  const todayStr = diary.today();

  // 월 커서 (그 달 1일)
  const [cursor, setCursor] = dpUseState(() => { const d = dpParse(todayStr); return new Date(d.getFullYear(), d.getMonth(), 1); });
  // 선택된 날짜 (YYYY-MM-DD)
  const [selected, setSelected] = dpUseState(todayStr);

  const y = cursor.getFullYear();
  const m = cursor.getMonth();

  const goPrev = () => setCursor(new Date(y, m - 1, 1));
  const goNext = () => setCursor(new Date(y, m + 1, 1));
  const goThisMonth = () => { const d = dpParse(todayStr); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(todayStr); };
  const isThisMonth = y === dpParse(todayStr).getFullYear() && m === dpParse(todayStr).getMonth();

  // 42칸(6주) — 그 달 1일이 속한 일요일부터
  const first = new Date(y, m, 1);
  const startOffset = first.getDay(); // 0=일
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(y, m, 1 - startOffset + i);
    return d;
  });

  const dow7 = [0,1,2,3,4,5,6];

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column", minHeight: 0,
      boxSizing: "border-box",
      background: "linear-gradient(160deg, #fdfbf2 0%, #fbf6ea 100%)",
      borderLeft: "1.1px solid var(--ink)",
      fontFamily: "var(--hand)",
    }}>
      {/* 헤더 — 월 이동 + 오늘 + 닫기 */}
      <div style={{
        flexShrink: 0, padding: "6px 8px",
        display: "flex", alignItems: "center", gap: 5,
        background: "linear-gradient(180deg, color-mix(in srgb, var(--chrome,#a9cdf5) 42%, white) 0%, color-mix(in srgb, var(--chrome,#a9cdf5) 12%, white) 100%)",
        borderBottom: "1.1px solid var(--ink)",
      }}>
        <button onClick={goPrev} title={L("dpack.prevMonth")} style={dpNavBtn}>‹</button>
        <div style={{
          flex: 1, textAlign: "center",
          fontFamily: "var(--hand)", fontSize: 15, fontWeight: 700, color: "var(--ink)",
          whiteSpace: "nowrap",
        }}>{dpMonthTitle(y, m)}</div>
        <button onClick={goNext} title={L("dpack.nextMonth")} style={dpNavBtn}>›</button>
        {!isThisMonth && (
          <button onClick={goThisMonth} title={L("dpack.today")} style={dpPillBtn}>{L("dpack.today")}</button>
        )}
        <button onClick={onClose} title={L("dpack.close")} aria-label={L("dpack.close")} style={{
          ...dpNavBtn, width: 22, fontSize: 13, fontWeight: 700,
        }}>×</button>
      </div>

      {/* 요일 머리글 */}
      <div style={{
        flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        borderBottom: "1px solid var(--ink-soft)",
        background: "rgba(255,255,255,0.5)",
      }}>
        {dow7.map(d => (
          <div key={d} style={{
            textAlign: "center", padding: "4px 0",
            fontFamily: "var(--hand)", fontSize: 11, fontWeight: 700,
            color: d === 0 ? "#e07a8a" : d === 6 ? "#6f8fd0" : "var(--ink-2)",
          }}>{(DP_WEEK[dpLang()] || DP_WEEK.ko)[d]}</div>
        ))}
      </div>

      {/* 월간 격자 */}
      <div style={{
        flexShrink: 0,
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gridAutoRows: "1fr",
        borderBottom: "1.1px solid var(--ink)",
      }}>
        {cells.map((d, i) => {
          const ds = dpDateOnly(d);
          const inMonth = d.getMonth() === m;
          const bundle = diary.select.dayBundle(state, ds);
          const retro = bundle.retro;
          const hasRecord = !!(retro && (retro.mood || (retro.text || "").trim())) || bundle.doneCount > 0;
          return (
            <DpDayCell
              key={i}
              date={d}
              inMonth={inMonth}
              isToday={ds === todayStr}
              isSelected={ds === selected}
              isSun={d.getDay() === 0}
              isSat={d.getDay() === 6}
              mood={retro?.mood || null}
              hasRecord={hasRecord}
              onClick={() => setSelected(ds)}
            />
          );
        })}
      </div>

      {/* 선택일 상세 — 완료한 일 / 기분 / 메모 */}
      <DpDayDetail date={selected} state={state} actions={actions} todayStr={todayStr} />
    </div>
  );
}

// ---- 월간 격자 한 칸 ----
function DpDayCell({ date, inMonth, isToday, isSelected, isSun, isSat, mood, hasRecord, onClick }) {
  const numColor = !inMonth ? "var(--ink-3)" : isSun ? "#e07a8a" : isSat ? "#6f8fd0" : "var(--ink)";
  return (
    <div onClick={onClick} title={`${date.getMonth() + 1}/${date.getDate()}`} style={{
      position: "relative", cursor: "pointer",
      minHeight: 38,
      borderRight: (date.getDay() !== 6) ? "1px solid var(--ink-soft)" : "none",
      borderTop: "1px solid var(--ink-soft)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "3px 0 2px",
      opacity: inMonth ? 1 : 0.45,
      background: isSelected
        ? "color-mix(in srgb, var(--chrome,#a9cdf5) 26%, white)"
        : isToday ? "color-mix(in srgb, var(--point,#fdff85) 28%, white)" : "transparent",
      transition: "background .12s",
    }}>
      <span style={{
        fontFamily: "var(--mono)", fontSize: 11.5,
        fontWeight: (isToday || isSelected) ? 700 : 400,
        color: numColor, lineHeight: 1.2,
      }}>{date.getDate()}</span>

      {/* 기분 아이콘 (있으면) — 없고 기록만 있으면 점 */}
      <span style={{ marginTop: 2, height: 14, display: "grid", placeItems: "center" }}>
        {mood
          ? <DpMoodIcon mood={mood} size={14} />
          : hasRecord
            ? <span title={L("dpack.record")} style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "var(--pink)", border: "0.7px solid var(--ink)",
              }} />
            : null}
      </span>
    </div>
  );
}

// ---- 선택일 상세 ----
function DpDayDetail({ date, state, actions, todayStr }) {
  const bundle = diary.select.dayBundle(state, date);
  const dObj = dpParse(date);
  const dow = dpWeekdayLabel(dObj.getDay());
  const isToday = date === todayStr;

  // 메모(일기) — 자동 저장 (디바운스). 기존 good/bad/mood 보존.
  const [text, setText] = dpUseState(bundle.retro?.text ?? "");
  const dirtyRef = dpUseRef(false);
  dpUseEffect(() => {
    setText(diary.getState().retros.find(r => r.date === date)?.text ?? "");
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  dpUseEffect(() => {
    if (!dirtyRef.current) return;
    const id = setTimeout(() => {
      const latest = diary.getState().retros.find(r => r.date === date);
      actions.saveRetro({
        date, text,
        good: latest?.good ?? "",
        bad: latest?.bad ?? "",
        mood: latest?.mood ?? null,
      });
      dirtyRef.current = false;
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const mood = bundle.retro?.mood || null;

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
      padding: "10px 12px 14px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* 날짜 제목 */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0,
      }}>
        <span style={{ fontFamily: "var(--hand)", fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>
          {dObj.getMonth() + 1}월 {dObj.getDate()}일
        </span>
        <span style={{ fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink-2)" }}>{dow}</span>
        {isToday && (
          <span style={{
            fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink)",
            background: "var(--point)", padding: "0 5px", borderRadius: 99,
            border: "1px solid var(--ink)",
          }}>{L("dpack.today")}</span>
        )}
      </div>

      {/* 완료한 할 일 (자동) */}
      <div>
        <div style={dpSecTitle}>
          {L("dpack.done")}
          <span style={dpBadge}>{bundle.doneCount} / {bundle.totalCount}</span>
        </div>
        {bundle.items.length === 0 ? (
          <div style={dpEmpty}>{L("dpack.noTodos")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {bundle.items.map(t => (
              <DpTodoLine key={t.id} t={t} onToggle={() => actions.toggleTodo(t.id)} />
            ))}
          </div>
        )}
      </div>

      {/* 기분 스탬프 1개 */}
      <div>
        <div style={dpSecTitle}>{L("dpack.mood")}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {DP_MOODS.map(mo => {
            const active = mood === mo.id;
            return (
              <button key={mo.id} onClick={() => actions.setMood(date, active ? null : mo.id)} title={mo.label} style={{
                all: "unset", cursor: "pointer",
                display: "grid", placeItems: "center",
                width: 30, height: 30, borderRadius: 7,
                background: active ? "color-mix(in srgb, var(--point,#fdff85) 70%, white)" : "transparent",
                border: active ? "1.2px solid var(--ink)" : "1px solid var(--ink-soft)",
                boxShadow: active ? "0 1.5px 0 var(--paper-3)" : "none",
                opacity: active ? 1 : 0.6,
                transition: "background .08s, opacity .08s",
              }}>
                <DpMoodIcon mood={mo.id} size={20} />
              </button>
            );
          })}
        </div>
      </div>

      {/* 하루 메모 */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 110 }}>
        <div style={dpSecTitle}>📝</div>
        <textarea
          value={text}
          onChange={(e) => { dirtyRef.current = true; setText(e.target.value); }}
          placeholder={L("dpack.memoPh")}
          style={{
            flex: 1, minHeight: 96, boxSizing: "border-box",
            border: "1.1px solid var(--ink)", borderRadius: 10, outline: "none", resize: "none",
            background: "#fffdf6",
            padding: "8px 10px",
            fontFamily: '"Gaegu", "Caveat", var(--hand)', fontSize: 15, lineHeight: 1.5,
            color: "#2a3340",
            boxShadow: "inset 0 1px 2px rgba(40,51,63,0.06)",
          }}
        />
      </div>
    </div>
  );
}

// ---- 완료 할 일 한 줄 ----
function DpTodoLine({ t, onToggle }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "6px 9px",
      background: "var(--paper)",
      border: "1.1px solid var(--ink)", borderRadius: 9,
      boxShadow: "0 1.5px 0 var(--paper-3)",
    }}>
      <button onClick={onToggle} title={t.done ? "되돌리기" : "끝냄으로"} style={{
        all: "unset", cursor: "pointer", flexShrink: 0,
        width: 16, height: 16, borderRadius: 4,
        border: "1.1px solid var(--ink)",
        background: t.done ? "var(--ink)" : "transparent",
        display: "grid", placeItems: "center",
        fontSize: 10, color: "#fff",
      }}>{t.done ? "✓" : ""}</button>
      <span style={{
        flex: 1, minWidth: 0, fontFamily: "var(--hand)", fontSize: 13,
        color: t.done ? "var(--ink-3)" : "var(--ink)",
        textDecoration: t.done ? "line-through" : "none",
        wordBreak: "break-word",
      }}>{t.title}</span>
    </div>
  );
}

const dpSecTitle = {
  display: "flex", alignItems: "baseline", gap: 6, marginBottom: 5,
  fontFamily: "var(--hand)", fontSize: 13, fontWeight: 700,
  color: "var(--ink)", letterSpacing: "0.02em",
};
const dpBadge = {
  fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)",
  background: "var(--paper-2)", padding: "0 6px", borderRadius: 99,
  border: "1px solid var(--ink-soft)", fontWeight: 400,
};
const dpEmpty = {
  padding: "14px 12px", textAlign: "center",
  fontFamily: "var(--hand)", fontSize: 12, color: "var(--ink-3)",
  background: "var(--paper-2)", border: "1.1px dashed var(--ink-soft)",
  borderRadius: 10,
};

window.DiaryPackPage = DiaryPackPage;
