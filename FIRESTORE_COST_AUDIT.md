# Firestore 비용/부하 진단 리포트 — 작업방(함께 작업방) 기능

> 대상 커밋 기준 코드 정적 분석. 추측 없이 실제 코드 라인만 근거로 작성.
> 작성일: 2026-05-31

---

## 사전 사실: 구조 요약

- Firestore 접근은 전부 `v2/firebase-bridge.jsx`에 캡슐화되어 있고, 호출은
  `v2/room-store.jsx` → `v2/view-room.jsx`(`useRoomSync`)에서 발생한다.
- **방 1개 최대 4명**으로 하드 제한됨.
  - 클라이언트: `firebase-bridge.jsx:169` `if (count >= 4) throw new Error("ROOM_FULL")`
  - 보안 규칙: `vendor/firebase-config.js:46` `resource.data.memberCount < 4`
- presence / 작업시간 / 완료알림은 **전부 Firestore 멤버 문서**
  (`rooms/{roomId}/members/{uid}`)에 저장. Realtime Database는 사용하지 않는다.

---

## [1] 실시간 구독(onSnapshot) 점검

### onSnapshot 호출 위치 — 코드 전체에서 정확히 2곳

| # | 위치 | 대상 | limit() | 비고 |
|---|------|------|---------|------|
| A | `firebase-bridge.jsx:303` (`watchMembers_remote`, 함수 :300) | `rooms/{roomId}/members` **컬렉션** | ❌ **없음** | 멤버 전체 구독 |
| B | `firebase-bridge.jsx:332` (`watchRoom_remote`, 함수 :329) | `rooms/{roomId}` **단일 문서** | N/A | 단일 doc이라 무관 |

### limit() 평가

- **A(`members` 컬렉션 구독)에 `limit()`이 없음** (`firebase-bridge.jsx:302-303`).
  현재는 방당 4명 cap(`:169`, 규칙 `:46`)이 사실상 상한 역할을 하지만,
  **쿼리 자체에는 안전장치가 없다** → cap을 푸는 순간 컬렉션 전체 무제한 read로
  전환되는 잠복 위험.
- `findByCode`만 `limit(1)`이 걸려 있음(`firebase-bridge.jsx:153`). 1회성 get이라 양호.

### 구독 해제(cleanup) — 양호 (누수 없음)

- 구독 부착: `view-room.jsx:156-160` effect에서 `attachToRoom(roomId)` 호출,
  **return으로 `detachAll()` 반환**(`:159`).
- `attachToRoom`은 진입 시 가장 먼저 `detachAll()` 호출(`room-store.jsx:94`)
  → 방 변경 시 **중복 구독 누수 없음**.
- `detachAll`이 두 unsub 핸들 모두 정리(`room-store.jsx:88-91`).
- **결론: 메모리/중복구독 누수 없음.**

### 한 명이 방 입장 시 동시에 열리는 구독 수

- **정확히 2개**: `room-store.jsx:100`(watchRoom) + `:109`(watchMembers).
  둘 다 `attachToRoom` 안에서 열린다.

---

## [2] 쓰기(write) 빈도 점검 — 비용 핵심

### setInterval/setTimeout 안에서 Firestore write — 단 1곳

- `view-room.jsx:1615-1617` **Heartbeat**:
  `setInterval(..., 2 * 60 * 1000)` → `room.patchMyMember({})`
  → `updateMyMember_remote`(`firebase-bridge.jsx:245`)가
  `memberRef.set({ lastActiveAt: serverNow() }, { merge: true })`(`:260`) 실행.
  - 주기: **2분마다 / 사용자당 1 write**. `paused`/`away`일 땐 멈춤(`view-room.jsx:1614`).

### 1초 주기 write는 없음 (치명적 패턴 아님)

- `view-room.jsx:137` `setInterval(1000)` → `setNow()` 로컬 리렌더만. Firestore 안 건드림.
- `tracker.jsx:72` `setInterval(1000)` → 로컬 store(`actions.addWorkMinutes`, `:83`)에만 commit. Firestore write 아님.
- `timer.jsx:790` `setInterval(1000)` → 포모도로 로컬 tick. Firestore write 아님.
- 즉 **"흐르는 작업시간"은 서버에 쓰지 않는다** — 설계 주석(`firebase-bridge.jsx:8`)대로
  클라이언트가 `workStartedAt` 기반으로 매초 로컬 계산(`view-room.jsx:57-59`).
  작업시간 자체는 세션 **시작 시 1번**(`workStartedAt=true`, `view-room.jsx:1593`),
  **종료 시 1번**(`:1589-1591`)만 write.

### 이벤트성 write (저빈도, 디바운스됨)

- 진행도 / 공개 todo / 상태 변경은 모두 `patchMyMember`를 거쳐
  **500ms 디바운스**(`room-store.jsx:242-270`).
- 상태 토글 쿨다운 3초(`room-store.jsx:219,225`), 박수 쿨다운 5초(`:227,234`).

### presence 쓰기

- Firestore에 씀(별도 RTDB 아님).
  - `status` 필드는 **수동 전환 시에만**(`view-room.jsx:1597-1599`)
  - `lastActiveAt`는 **2분 heartbeat + 모든 이벤트 write에 동봉**(`firebase-bridge.jsx:249,266`)
- **offline은 write하지 않음** — `onDisconnect` 없음.
  탭을 닫으면 아무 write도 안 일어나고, 남들이 `lastActiveAt`이 5분 지났는지로
  추정(`view-room.jsx:46-47`).

---

## [3] presence(온라인/오프라인) 구현 방식

- **저장소: Firestore 멤버 문서** (`rooms/{roomId}/members/{uid}`의 `status` + `lastActiveAt`).
  Realtime Database 미사용.
- **온라인 판정:** `lastActiveAt`이 2분 heartbeat로 갱신, 5분 초과 시 오프라인
  간주(`view-room.jsx:46-47`).
- **N명 방에서 1명 상태 변화 → read 유발 수:**
  멤버 컬렉션 구독자가 방 안의 모든 멤버(N명)이므로,
  **1명의 write → N명에게 각 1 read = N reads** (N≤4).
  변경된 문서 1개에 대해 리스너 N개가 각각 과금됨.

---

## [4] 읽기 증폭 패턴

### 한 사용자 액션 → 타 사용자 read 흐름

1. 사용자 A가 완료 체크 → `useRoomSync` effect 발화(`view-room.jsx:1542-1602`)
   → `patchMyMember`(완료면 `updateMineWithLog`, `firebase-bridge.jsx:289`로 멤버 doc 1 write).
2. 그 멤버 문서가 바뀌면 → **같은 방 N명의 `watchMembers` 리스너(A 구독)가 모두 발화**
   → 각자 변경 doc 1개 read.
3. 결과: **1 액션(1 write) → N reads** (자기 자신 포함).

- **박수:** `sendClap_remote`(`firebase-bridge.jsx:347-352`)가 `rooms/{roomId}` 문서의
  `recentClaps` 배열을 rewrite → `watchRoom` 구독자 N명이 각 1 read.

### N배 / N제곱배 구조

- **방 내부**에서 방의 모두가 한 번씩 활동하는 "한 라운드" = N writes × N readers
  = **N² reads/room**. 단 **N이 4로 cap**(`firebase-bridge.jsx:169`,
  규칙 `vendor/firebase-config.js:46`)되어 방당 최대 16 reads로 **묶여 있음**
  (per-room N²은 위험 낮음).
- 진짜 증폭축은 **방 개수(= 전체 동시접속 / 4)** 에 대한 **선형 증가**.
  1000명 = 250개 방. heartbeat만으로:
  - **writes:** 사용자당 2분 1회 = `1000명 × 30회/시간 = 30,000 writes/시간`
    → **무료티어 20,000 writes/일을 약 40분 만에 초과**.
  - **reads:** 각 heartbeat write가 방 멤버 N(≈4)에게 fan-out
    = `500 writes/분 × 4 = 2,000 reads/분 = 120,000 reads/시간`
    → **무료티어 50,000 reads/일을 약 25분 만에 초과**.
- → **1000 동접에서 무료티어가 끊긴 1차 원인은 heartbeat write 물량이 동접 수에
  선형 비례한 것**으로 코드상 설명됨 (1초 타이머 버그가 아님).

---

## [5] 종합

### 폭발 위험 분류

| 항목 | 위험 | 근거 |
|------|------|------|
| **Write 폭발** | **높음** | heartbeat(`view-room.jsx:1615`)가 작업 중인 전 사용자에 대해 2분마다 무조건 write. 동접 수에 선형 비례, cap 없음. |
| **Read 폭발** | **높음** | 모든 멤버 write가 `watchMembers`(limit 없음, `firebase-bridge.jsx:303`)로 방 인원 N배 fan-out. heartbeat write까지 N배 증폭. |
| **방 내부 N² 증폭** | **낮음** | N이 4로 cap(`firebase-bridge.jsx:169`, 규칙 `vendor/firebase-config.js:46`)되어 방당 최대 16 reads로 한정. |

### 가장 비용이 큰 상위 3곳 (우선순위)

#### 1순위 — Heartbeat 주기 write
- **위치:** `view-room.jsx:1615-1617` → `firebase-bridge.jsx:260`
- **현재 코드:** 작업 중 전 사용자가 2분마다 `lastActiveAt` write,
  매 write가 방 N명에게 read fan-out. write·read 양쪽 최대 비용원.
- **권장 변경:** presence(online/offline + lastActiveAt)를 **Realtime Database로 이전**하고
  `onDisconnect()`로 오프라인 처리(Firebase 공식 presence 패턴, Firestore보다 저렴하고
  fan-out 과금 구조가 다름). 즉시 이전이 어렵다면
  ① 주기를 2분 → 5~10분으로 늘리고
  ② presence 필드를 멤버 카드의 안정 필드와 **분리**해 heartbeat가 카드 전체 read를
  재트리거하지 않게 함.

#### 2순위 — `members` 컬렉션 onSnapshot에 limit 없음 + 휘발 필드 혼재
- **위치:** `firebase-bridge.jsx:300-326`
- **현재 코드:** `.collection("members").onSnapshot(...)` (`:302-303`), limit 없음.
  `lastActiveAt`(휘발) 같은 잦은 변경이 todo/카드 데이터와 한 문서에 섞여 있어
  모든 잔변경이 N배 read를 유발.
- **권장 변경:** 방어적으로 `.limit(N)` 추가. 더 근본적으로는 **presence를 RTDB로 분리**하거나
  휘발 필드를 별도 문서로 떼어, `watchMembers` 리스너가 의미 있는 카드 변경
  (`todoDone`, `visibleTodos`)에만 발화하도록.

#### 3순위 — 증가하는 배열을 doc에 동봉해 rewrite
- **위치:** `firebase-bridge.jsx:281-289`(`recentLog` ≤50),
  `firebase-bridge.jsx:347-352`(`recentClaps` ≤20)
- **현재 코드:** 완료/박수 1건마다 멤버 doc의 `recentLog`(최대 50개) 또는
  방 doc의 `recentClaps`(최대 20개) **배열 전체를 트랜잭션으로 rewrite**
  → 리스너 N명에게 fan-out. doc 크기·트랜잭션 비용 증가.
- **권장 변경:** `recentLog`/`recentClaps`를 **append-only 서브컬렉션의 작은 문서**로
  분리하고 `onSnapshot`에 `orderBy + limit`. 그러면 신규 이벤트 = 작은 1 write,
  리스너는 새 문서만 수신(배열 전체 rewrite/재수신 제거).

---

### 참고: 양호한 점 (오해 방지)

- 구독 cleanup 정상, 누수 없음(`view-room.jsx:159`, `room-store.jsx:88-94`).
- 1초 타이머들은 전부 로컬 전용, **흐르는 작업시간을 서버에 쓰지 않음**
  (`firebase-bridge.jsx:8` 설계대로 `view-room.jsx:57-59`에서 로컬 계산).
- 이벤트 write는 500ms 디바운스 + 쿨다운으로 잘 묶여 있음
  (`room-store.jsx:242-270, 219-234`).
