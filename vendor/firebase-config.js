// ===========================================================
// Firebase config — 작업방(함께 작업방) 기능에서만 사용
// ===========================================================
// ‼ 비어 있으면 "로컬 미리보기 모드"로 자동 폴백합니다.
//   (혼자서 방을 만들고 UI를 미리 볼 수는 있지만, 다른 사람과 공유되지 않아요)
//
// 사용법:
// 1) Firebase 콘솔 → 프로젝트 만들기
// 2) "웹 앱 추가" → SDK 설정 → firebaseConfig 객체 복사
// 3) 아래 빈 객체에 그 값을 그대로 붙여넣어 주세요.
// 4) Authentication → Sign-in method → "Anonymous(익명)" 켜기
// 5) Firestore Database → "프로덕션 모드"로 만들기 → 보안 규칙은 README 참조
// ===========================================================
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyC9v1EXY37npuwKy1qBUDrYqsx3fVhqY2s",
  authDomain: "todoary-990ba.firebaseapp.com",
  projectId: "todoary-990ba",
  storageBucket: "todoary-990ba.firebasestorage.app",
  messagingSenderId: "981331898841",
  appId: "1:981331898841:web:3ed20cae352b01b3bfe9c8",
  measurementId: "G-HMGFLFF471"
};

// 사용할 Firebase 버전 (compat 빌드 — 글로벌 firebase 객체 노출)
window.FIREBASE_VERSION = "10.13.0";

// Firestore 보안 규칙 (Firebase 콘솔 → Firestore → Rules 에 붙여넣기):
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isMember(roomId) {
      return signedIn() &&
        exists(/databases/$(database)/documents/rooms/$(roomId)/members/$(request.auth.uid));
    }

    match /rooms/{roomId} {
      allow read: if signedIn();
      allow create: if signedIn();
      // 멤버는 자유롭게 update / 비멤버는 memberCount +1 (≤4) 또는 -1(퇴장) 만 허용
      allow update: if isMember(roomId)
        || (signedIn()
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberCount'])
            && (
              (request.resource.data.memberCount == resource.data.memberCount + 1 && resource.data.memberCount < 4)
              || (request.resource.data.memberCount == resource.data.memberCount - 1 && resource.data.memberCount > 0)
            ));
      allow delete: if isMember(roomId);

      match /members/{uid} {
        allow read: if isMember(roomId) || request.auth.uid == uid;
        // 본인 문서만 쓰기 가능 — 남의 카드 못 덮어씀
        allow create, update, delete: if signedIn() && request.auth.uid == uid;
      }

    }
  }
}
*/
