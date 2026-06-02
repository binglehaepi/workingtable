# 🪄 todoary

작업할 때 화면 옆에 띄워두는 **투명 사이드 다이어리** 데스크탑 앱.
할 일·명령어·문의 메일·달력 메모를 한 창에서 관리하고, 배경/테마를 자유롭게 꾸밀 수 있어요.
Windows · macOS 지원, 자동 업데이트.

> A translucent side-dock diary widget for focused work. Tasks, command snippets,
> inbox drafts and a calendar/diary in one slim window. Windows · macOS, auto-updating.

---

## ✨ 주요 기능

- **할 일** — 해야 할 일 / 한 일 (마스킹테이프 스타일 카드)
- **명령어** — 자주 쓰는 코드·명령 스니펫 저장, 클릭 한 번에 복사 (사용 횟수 자동 집계)
- **문의** — 받은 메일 붙여넣기 → 답장 초안 작성, 답장 여부 기록, 메일별 사이트 링크
- **달력** — 작업 시간·완료한 일·받은 메일이 날짜별로 자동 기록되는 일기형 월간 달력
- **상단 헤더** — YouTube 배경 음악 플레이어 + 오늘 작업 시간(`00 H 00 M`) + 디데이
- **꾸미기** — 테마 프리셋(메론소다·여름·딸기우유 등) / 다중 색 그라데이션 편집기(선형·원형, 방향, 색 스탑) / 헤더·바·포인트 색 / **내 테마 저장**
- **설정** — 언어(한국어·English·中文·日本語, OS 언어 자동 감지) / 도크 위치 / 앱 길이(기본·컴팩트, 해상도 자동 맞춤) / 데이터 초기화
- **데스크탑 모드** — 테두리 없는 투명 창으로 작업 화면 위에 띄우기
- **자동 업데이트** — 새 버전 출시 시 다음 실행에서 자동 적용

---

## 📥 설치

최신 버전: **[Releases](https://github.com/binglehaepi/workingtable/releases/latest)**

| OS | 파일 |
|----|------|
| **Windows** | `todoary_x.y.z_x64-setup.exe` (또는 `_x64_en-US.msi`) |
| **macOS** (Apple Silicon + Intel) | `todoary_x.y.z_universal.dmg` |

설치 후 새 버전이 나오면 **자동 업데이트**로 받아집니다.

### ⚠️ 보안 경고에 대해 (개발자 인증 없음)

이 앱은 상용 코드 서명 인증서(Windows) / Apple 공증(macOS)이 **없습니다**.
그래서 첫 실행 시 OS가 "알 수 없는 개발자" 경고를 띄울 수 있어요. **악성 프로그램이 아니며**, 아래처럼 한 번만 허용하면 됩니다.

**Windows**
1. 설치 시 **"Windows의 PC 보호 (SmartScreen)"** 파란 창이 뜨면
2. **"추가 정보"** → **"실행"** 클릭. 이후엔 경고 없이 실행됩니다.

**macOS**
1. `.dmg`를 열어 앱을 **응용 프로그램** 폴더로 드래그.
2. 첫 실행 시 *"개발자를 확인할 수 없습니다"* 가 뜨면
   **앱 우클릭(Control+클릭) → 열기 → 열기**, 또는 **시스템 설정 → 개인정보 보호 및 보안**에서 **"확인 없이 열기"**.
3. `"손상되어 열 수 없습니다"`(격리 속성) 가 뜨면 터미널에서:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/todoary.app"
   ```

> English: the app isn't code-signed/notarized, so allow it once —
> Windows: **More info → Run anyway**; macOS: right-click → **Open → Open**
> (or `xattr -dr com.apple.quarantine "/Applications/todoary.app"` if it says "damaged").
> 자세한 내용은 **[INSTALL.md](INSTALL.md)** 참고.

---

## 🛠 기술 스택

- **[Tauri 2](https://tauri.app/)** (Rust + 시스템 WebView) — 가벼운 데스크탑 패키징
- **React 18 (UMD) + Babel standalone** — 번들러 없이 브라우저에서 직접 JSX 실행
- 상태는 `localStorage` 한 곳에 저장 (`window.diary` 전역 스토어)
- 플러그인: `updater`(자동 업데이트), `opener`(링크/폴더 열기), `notification`

## 📚 개발 문서

- **[FIRESTORE_GUIDE.md](FIRESTORE_GUIDE.md)** — 함께 작업방 Firestore 구조·비용 설계·presence 상수
- **[I18N_GUIDE.md](I18N_GUIDE.md)** — 다국어 추가/수정

## 📂 구조

```
todoary.html                            # 진입점 (스크립트 로드 + App)
v2/                                    # 화면 모듈 (스토어/뷰/타이머/꾸미기/i18n …)
styles.css                             # 디자인 토큰 & 공통 스타일
src-tauri/                             # Tauri (Rust) — 설정·권한·번들
scripts/build-dist.mjs                 # 웹 자산을 dist/ 로 복사 (빌드 전처리)
.github/workflows/release.yml          # 태그 push 시 Win+macOS 자동 빌드/릴리스
```

## 💻 개발 / 빌드

```bash
# 개발 실행 (창 띄우기)
npm install
npx tauri dev

# 릴리스 빌드 (설치 파일 생성)
npx tauri build

# 새 버전 배포: 버전 올리고 태그 push → GitHub Actions가 자동 빌드/서명/릴리스
#  (tauri.conf.json / Cargo.toml 버전 동기화 후)
git tag v0.3.1 && git push origin v0.3.1
```
