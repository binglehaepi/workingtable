# STEP 0 — presence 영향 범위 매핑 (코드 수정 없음)

> 목표: presence(온라인 상태 + lastActiveAt)를 Firestore에서 분리해 Realtime Database로 이전.
> 본 문서는 이전 전 영향 범위만 매핑한 것이며, **코드는 수정하지 않음**.
> 작성일: 2026-05-31

---

## A. presence 관련 Firestore **WRITE** 위치

| 종류 | 위치 | 내용 |
|------|------|------|
| **heartbeat `lastActiveAt` write** | `view-room.jsx:1615-1617` → `room-store.jsx:255-270` → `firebase-bridge.jsx:245-261` | 2분 setInterval → `patchMyMember({})` → `updateMyMember_remote`가 `lastActiveAt: serverNow()`(`:249`)를 `memberRef.set(..., {merge})`(`:260`) |
| **수동 `status` write** | `view-room.jsx:1597-1599` (`patch.status = myStatus`) ← 값 출처 `room-store.jsx:215-223` `setMyStatus` | working/away/paused 전환 시 멤버 doc에 `status` write |
| **모든 이벤트 write에 `lastActiveAt` 동봉** | `firebase-bridge.jsx:249` (`updateMyMember_remote`), `:266` (`updateMyMemberWithLog_remote`) | todo/진행도/완료로그 write에도 매번 `lastActiveAt` 끼워 씀 → 카드 데이터 변경마다 presence도 갱신됨 |
| **입장 시 초기 presence** | `firebase-bridge.jsx:187` (`joinRoom`의 `status:"idle"`, `lastActiveAt`) | 멤버 문서 최초 생성 |

(로컬모드 동등물 `firebase-bridge.jsx:417, 450, 469` — 과금 대상 아님, 참고용)

---

## B. presence 관련 Firestore **READ** 위치

| 위치 | 내용 |
|------|------|
| `firebase-bridge.jsx:300-326` (`watchMembers_remote`, onSnapshot `:303`) | 멤버 컬렉션 구독. presence 필드 `status`(`:311`), `workStartedAt`(`:312`), `lastActiveAt`(`:320`)를 **카드 데이터(todoDone/visibleTodos 등)와 한 스트림에 섞어** 수신 → **fan-out 증폭의 진원지** |
| `room-store.jsx:109-112` | 위 콜백 결과를 `state.members`로 저장, 모든 UI가 구독 |

---

## C. 온라인/오프라인 **판정 로직**

| 함수 | 위치 | 판정 근거 |
|------|------|-----------|
| `isMemberOffline` | `view-room.jsx:45-48` | `lastActiveAt`이 **5분 초과**면 offline |
| `memberRoomStatus` | `view-room.jsx:80-87` | 우선순위: 본인 away → **offline(=isMemberOffline)** → paused → away → workStartedAt면 working → online |
| MemberCard `displayStatus` | `view-room.jsx:1024-1037` | **offlineByTimeout(=isMemberOffline)** → paused → away → workStartedAt working → idle |

---

## D. 판정값을 쓰는 **UI 위치**

| 위치 | 용도 |
|------|------|
| `view-room.jsx:682` | 컴팩트 멤버 행에 `displayStatus` 전달 |
| `view-room.jsx:734-737` | offline이면 `opacity 0.55` |
| `view-room.jsx:814-861` | 작은 카드 — offline grayscale/opacity(`:833-834`), 상태 점 색(`:858`), 상태 라벨(`:861`) |
| `view-room.jsx:1024-1118` | 풀 카드 — 카드 dim, 점 색(`:1064`), 라벨(`:1066-1069`), `StatusToggle`(`:1118`) |
| `view-room.jsx:509-535` | `statusSig`(`memberRoomStatus` 기반)로 **상태 변화 이벤트 로그** 생성 → 알림/로그 표시 |
| `roomStatusText` `:88-93`, `shouldLogRoomStatusChange` `:95-101` | 상태 변화 로그 텍스트/필터 |
| `StatusToggle` `:1264-1315` | 본인 수동 상태(working/away/paused) 토글 UI (offline은 메뉴 없음) |

---

## E. ⚠️ 반드시 짚어야 할 결합 — `lastActiveAt`은 presence 전용이 아님

`lastActiveAt`은 **두 가지 용도로 동시에 쓰임**:

1. **presence(온라인 판정)** — `isMemberOffline` `view-room.jsx:46-47`
2. **작업시간 시계 freeze** — `memberLiveSeconds` `view-room.jsx:59`에서, 멤버가 끊겼을 때
   다른 사람 화면의 시계를 **마지막 heartbeat 시점에 멈추는 cutoff**로 사용.
   동일 로직이 `useRoomSync`의 session 종료 cutoff `view-room.jsx:1585`(`meLastActiveAt`)에도 있음.

→ 즉 `lastActiveAt`을 RTDB로 옮기면, **"작업시간 로컬 계산"이 RTDB의 offline 시각(lastChanged)을
cutoff로 읽어야** 동작이 유지됨. 이 부분은 "작업시간 로컬 계산은 건드리지 말 것" 제약과
**겹치는 지점**이라, STEP 2에서 입력 소스만 RTDB로 바꾸되 계산식 자체는 그대로 둘지 확인 필요.

---

## F. 변경 시 영향받는 컴포넌트/파일

- `v2/firebase-bridge.jsx` — presence write 3종 + `watchMembers` + (신규) RTDB 모듈
- `v2/room-store.jsx` — `patchMyMember` 파이프라인, `state.members`, (신규) presence 상태
- `v2/view-room.jsx` — `isMemberOffline`, `memberRoomStatus`, `memberLiveSeconds`, 카드 2종,
  `StatusToggle`, `useRoomSync`의 status/lastActiveAt 처리, 상태 변화 로그(`statusEvents`)

---

## 다음 단계

위 매핑(특히 **E의 `lastActiveAt` 이중 용도**)을 확인 후 STEP 1로 진행:
- heartbeat 주기 2분 → 8분
- `watchMembers`의 members 컬렉션 onSnapshot에 방어용 `limit(8)` 추가
