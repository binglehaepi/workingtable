# Todoary Firestore 가이드 (함께 작업방)

작업방(실시간 presence·공유 할 일·박수)만 Firestore를 사용합니다.  
할 일·일기·작업시간(`workSessions`)·프로젝트 데이터는 **전부 `localStorage`(`todoary.v1`)** 이며 Firestore에 올라가지 않습니다.

> 최종 반영: heartbeat 4분 + 멤버별 doc 리스너 + 퇴장 시 `claps/*` 조회 제거 (develop 기준)

---

## 1. 관련 파일

| 파일 | 역할 |
|------|------|
| `vendor/firebase-config.js` | `window.FIREBASE_CONFIG`, SDK 버전, 규칙 예시 주석 |
| `v2/firebase-bridge.jsx` | Firestore CRUD·리스너·로컬 폴백 |
| `v2/room-store.jsx` | 방 상태·`patchMyMember` 디바운스·구독 attach |
| `v2/view-room.jsx` | UI·`useRoomSync`·presence 상수 |
| `v2/analytics.jsx` | DAU (Analytics 우선, Firestore fallback) |
| `firestore.rules` | 배포용 보안 규칙 |
| `firestore.indexes.json` | `rooms.inviteCode` 단일 필드 인덱스 |

---

## 2. 초기 설정

1. Firebase 콘솔에서 웹 앱 추가 → `firebaseConfig`를 `vendor/firebase-config.js`에 붙여넣기.
2. **Authentication → 익명(Anonymous)** 로그인 사용.
3. **Firestore** 생성(프로덕션 모드) → `firestore.rules` 내용 **게시**.
4. `measurementId`가 있으면 Analytics `app_launch`만 쓰고, Firestore `stats/daily` fallback은 거의 안 탐.

`FIREBASE_CONFIG`가 비어 있거나 init 실패 시 **`bridgeStatus === "local"`** — 혼자만 보는 미리보기(localStorage).  
실제 비용·동기화 검증은 **`bridgeStatus === "ready"`** 일 때만 가능합니다.

---

## 3. 데이터 모델

```
inviteCodes/{CODE}          → { roomId }

rooms/{roomId}
  ├── name, inviteCode, hostUid
  ├── memberCount           (최대 4)
  ├── createdAt             (serverTimestamp)
  └── recentClaps[]         ← 박수 (최대 20건, in-memory 배열)

rooms/{roomId}/members/{uid}
  ├── displayName, avatar, status
  ├── workStartedAt, accumulatedSecondsToday, accumulatedDate
  ├── workSecondsTotal      ← 방 합계는 클라이언트가 멤버별 합산
  ├── todoTotal, todoDone, visibleTodos[], recentLog[] (최대 50)
  ├── statusMessage, statusMessageAt
  ├── lastActiveAt, joinedAt
  └── roomLevel, lastLevelDay
```

### 사용하지 않는 것

| 항목 | 설명 |
|------|------|
| `rooms/{id}/claps/*` | **레거시**. 현재 앱은 `recentClaps`만 사용. 퇴장 시 전체 `.get()` **하지 않음**. |
| `rooms.totalWorkSeconds` | 서버 누적 **no-op** (`addRoomWorkSeconds` 빈 함수). |

---

## 4. 비용 설계 원칙

1. **흐르는 시간은 서버에 쓰지 않음** — `workStartedAt` + 클라이언트 시계로 초 단위 표시·합산.
2. **사건 단위 write** — 작업 시작/종료, 진행도, 공개 할 일, 박수, 입퇴장, 상태 메시지 등.
3. **`patchMyMember` 500ms 디바운스** — 연타를 한 번의 write로 (heartbeat·즉시 patch 제외).
4. **heartbeat** — 주기적 `lastActiveAt`만 갱신; 로컬 가드로 불필요 write 생략.
5. **멤버 구독** — 컬렉션 `onSnapshot` 대신 **uid별 `doc` `onSnapshot`** (변경된 멤버 문서만 read 증폭 방지).
6. **roster(입·퇴장)** — `rooms.memberCount` 변경 시에만 `members.get()`으로 uid 목록 동기화.

---

## 5. Presence · heartbeat 상수

정의 위치: `v2/view-room.jsx` (`useRoomSync` 근처)

| 상수 | 값 | 의미 |
|------|-----|------|
| `ROOM_HEARTBEAT_INTERVAL_MS` | 4분 | `setInterval` tick 주기 |
| `ROOM_HEARTBEAT_MIN_AGE_MS` | 4분 | 서버 `lastActiveAt`이 더 최근이면 heartbeat **write 생략** |
| `ROOM_MEMBER_OFFLINE_MS` | 7분 | 초과 시 타인 화면에서 **오프라인(회색)** |

관계: `OFFLINE (7) > HEARTBEAT_MIN_AGE (4) ≈ INTERVAL (4)`  
→ 앱을 켠 채 방에 있으면 heartbeat·사건 patch 때문에 **7분 기다려도 오프라인이 안 되는 것이 정상**입니다.

오프라인 테스트:

- 탭/앱 **강제 종료**(나가기 아님), 또는 `paused` / `away` → heartbeat 중단 → 약 7분 후 오프라인.

본인 `workingNow`(트래커) 판정은 `workSessions.lastTs` **3분** — presence와 별도 (`useRoomSync`).

Heartbeat 구현 메모:

- tick에서 `window.roomStore.getS()`로 최신 `lastActiveAt` 조회 (`room.getS()` 아님).
- `paused` / `away`일 때 interval 자체를 돌리지 않음.

---

## 6. 실시간 구독 (firebase-bridge)

### 방 메타 — `rooms.watch(roomId)`

- `rooms/{roomId}` **doc `onSnapshot` 1개**
- `createdAt` → ms로 정규화, `serverTimestamps: "estimate"`
- **`memberCount` 변경 시** `triggerMemberRosterSync` → 멤버 roster 갱신

### 멤버 — `members.watch(roomId)`

**이전:** `members` 컬렉션 전체 `onSnapshot`  
**현재:**

1. 최초 + `memberCount` 변경 시 `members.get()` → 새 uid에만 `attachDoc`
2. 각 `members/{uid}` **doc `onSnapshot`** — 해당 uid patch 시 **그 doc만** 리스너 갱신
3. 퇴장 uid → doc 리스너 `unsubscribe`

Network에서 `Listen/channel` (GET)이 **여러 개** 보이는 것은 정상입니다 (방 1 + 멤버 ≤4).

### 박수 — `claps.send`

- `rooms/{roomId}` 문서의 **`recentClaps` 배열**을 트랜잭션으로 append (최대 20)
- 클라이언트 **5초 쿨다운** (`room-store.jsx`)

---

## 7. 쓰기가 발생하는 대표 사건

| 사건 | 경로 |
|------|------|
| 방 만들기 / 입장 | `rooms.create`, `join`, `inviteCodes` |
| heartbeat (4분, 가드 통과) | `members.updateMine` — `lastActiveAt`만 |
| 할 일 완료·진행도·공개 할 일 | `updateMine` / `updateMineWithLog` (로그 시 트랜잭션) |
| 작업 세션 시작/종료 | `workStartedAt`, `workSecondsTotal` 등 |
| 박수 | `recentClaps` 트랜잭션 |
| 상태 메시지 저장 | `patchMyMemberImmediate` |
| 나가기 | 멤버 삭제 + `memberCount` 또는 방 삭제(마지막 1명) |

**하지 말 것:** 매초/매분 작업시간 서버 누적, 빈 필드로 heartbeat 남발, 컬렉션 전체 리스너로 멤버 다시 붙이기.

---

## 8. 입장 코드

1. **우선:** `inviteCodes/{CODE}` doc 1회 read → `roomId`
2. **폴백(구데이터):** `rooms` where `inviteCode ==` (인덱스: `firestore.indexes.json`)

---

## 9. Analytics (Firestore와 분리)

- `v2/analytics.jsx` — 앱 실행 시 1회 `app_launch` (Firebase Analytics).
- 실패 시에만 `stats/daily/{YYYY-MM-DD}` merge write (기기당 하루 1회, localStorage 가드).
- `firestore.rules`에 `stats` 규칙이 **없으면** fallback write는 거부됨 → Analytics만 쓰는 구성 권장.

---

## 10. DevTools로 확인하는 법

| 보이는 것 | 의미 |
|-----------|------|
| `.../Listen/channel` GET | 실시간 **수신** (리스너). heartbeat **쓰기가 아님** |
| `.../Write` 또는 `.../Commit` POST | 실제 **쓰기** (heartbeat·사건 patch) |

heartbeat 확인:

1. Network → `firestore` 필터, Method **POST**
2. 입장 후 **4분+** 대기 (할 일 완료 직후는 가드로 생략될 수 있음)
3. Payload에 `lastActiveAt` / update 관련 필드

---

## 11. 보안 규칙 요약 (`firestore.rules`)

- 익명 로그인 필수.
- `members/{uid}`: **본인 uid만** create/update/delete.
- `rooms`: 멤버 update 또는 비멤버의 **`memberCount` ±1만** (4명 제한).
- `inviteCodes`: 로그인 사용자 read/create/delete (update 불가).

콘솔에 `permission-denied` → 규칙 미게시 또는 Anonymous 미활성.

---

## 12. 로컬 · 개발 샌드박스

| 모드 | Firestore |
|------|-----------|
| `local` (config 없음 / init 실패) | localStorage `todoary.room.localStore` |
| `roomDevSandbox` ON | Firestore **미사용**, 가상 멤버만 |

---

## 13. 변경 이력 (비용 최적화)

| 단계 | 내용 |
|------|------|
| 1 | heartbeat 2분→4분, `lastActiveAt` 로컬 가드, 오프라인 5분→7분 |
| 2 | `members` 컬렉션 리스너 → uid별 doc 리스너 + `memberCount` roster sync |
| 3 | 마지막 1명 퇴장 시 `claps/*` `.get()` 제거 (`recentClaps`는 방 삭제로 정리) |

---

## 14. 코드 수정 시 체크리스트

- [ ] presence 상수 세 개를 **함께** 조정했는가?
- [ ] heartbeat에 `room.getS` 같은 없는 API를 쓰지 않았는가? → `window.roomStore.getS()`
- [ ] 멤버 전체를 다시 `collection.onSnapshot`으로 돌리지 않았는가?
- [ ] 작업시간을 분 단위로 Firestore에 쓰지 않았는가?
- [ ] `firestore.rules` 배포 없이 프로덕션 필드만 추가하지 않았는가?

---

## 15. 레거시 정리 (선택)

예전 빌드가 남긴 `rooms/{roomId}/claps/*` 문서는 앱이 읽지 않습니다.  
Firebase 콘솔에서 해당 서브컬렉션을 수동 삭제해도 동작에 영향 없습니다.
