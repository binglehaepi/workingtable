/* global React, diary, ViewHeader, Divider, InlineAdd, DelBtn, ToggleBadge */
// ===========================================================
// 할 일 — 추가 / 체크 / 급함 토글 / 삭제
// ===========================================================

function TodoView() {
  const { state, actions } = diary.useDiary();
  const items = diary.select.todosForCurrent(state);
  const hot   = items.filter(x => !x.done && x.hot);
  const rest  = items.filter(x => !x.done && !x.hot);
  const done  = items.filter(x => x.done);

  const todoCount = hot.length + rest.length;
  return (
    <SplitPane
      topLabel={`${L("todo.need")} · ${todoCount}`}
      top={
        <>
          <div style={{ marginBottom: 8 }}>
            <InlineAdd placeholder={L("todo.add")} onAdd={(v) => actions.addTodo(v)} />
          </div>
          {hot.map((t, i) => <TodoRow key={t.id} t={t} actions={actions} i={i} hot />)}
          {rest.map((t, i) => <TodoRow key={t.id} t={t} actions={actions} i={hot.length + i} />)}
          {todoCount === 0 && <div className="sk-cap">{L("todo.emptyNeed")}</div>}
        </>
      }
      bottomLabel={`${L("todo.done")} · ${done.length}`}
      bottom={
        <>
          {done.map((t, i) => <TodoRow key={t.id} t={t} actions={actions} i={i} />)}
          {done.length === 0 && <div className="sk-cap">{L("todo.emptyDone")}</div>}
        </>
      }
    />
  );
}

function TodoRow({ t, actions, hot, i = 0 }) {
  return (
    <div className="tape" style={{
      ...tapeStyle(i),
      display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
      marginBottom: 7,
    }}>
      <button
        onClick={() => actions.toggleTodo(t.id)}
        className={"sk-check" + (t.done ? " done" : "")}
        style={{ cursor: "pointer" }}
        title={t.done ? L("todo.titleUndo") : L("todo.titleDone")}
      />
      <span style={{
        fontFamily: "var(--hand)", fontSize: 15, flex: 1,
        color: t.done ? "var(--ink-3)" : "var(--ink)",
        textDecoration: t.done ? "line-through" : "none",
      }}>{t.text}</span>
      {!t.done && (
        <button onClick={() => actions.toggleHot(t.id)}
          title={t.hot ? L("todo.titleHotOff") : L("todo.titleHotOn")}
          style={{
            all: "unset", cursor: "pointer", fontSize: 14,
            color: t.hot ? "var(--ink)" : "var(--ink-3)",
            padding: "0 4px",
          }}>!</button>
      )}
      <DelBtn onClick={() => actions.removeTodo(t.id)} />
    </div>
  );
}

window.TodoView = TodoView;
