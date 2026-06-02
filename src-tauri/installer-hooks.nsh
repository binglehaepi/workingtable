; ===========================================================
; Tauri 2 NSIS installer hooks
;
; productName 을 vibe-diary -> todoary 로 리네임하면 (commit 2ddb7d5)
; 윈도우가 둘을 별개 앱으로 인식해서 새 인스톨이 옛 인스톨 옆에 설치됨.
; 이 훅이 새 todoary 설치 직전에 옛 vibe-diary 등록을 찾아 silent 제거.
;
; 데이터(localStorage, WebView2 사용자 데이터)는 보존:
;  - bundle identifier 가 app.vibe-diary 그대로라서 WebView2 user data 폴더
;    (%LOCALAPPDATA%\app.vibe-diary\EBWebView) 가 유지됨
;  - Tauri NSIS 언인스톨러의 /S 모드는 user data 를 기본 유지
;
; 이 훅은 옛 vibe-diary 등록이 없으면 조용히 패스함 — 신규 설치엔 영향 없음.
;
; macOS: NSIS 훅 없음 → src-tauri/src/legacy_macos.rs 가 todoary 첫 실행 시
;        /Applications(및 ~/Applications) 의 vibe-diary.app 을 bundle id 확인 후 1회 삭제.
; ===========================================================

!include "LogicLib.nsh"

; 한 REG_HIVE (HKCU 또는 HKLM) 의 특정 DISPLAY_NAME 등록을 찾아 silent 제거
!macro RemoveOldVersion REG_HIVE DISPLAY_NAME
  Push $R0
  ReadRegStr $R0 ${REG_HIVE} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${DISPLAY_NAME}" "UninstallString"
  ${IfNot} $R0 == ""
    DetailPrint "Found legacy install: ${DISPLAY_NAME} (${REG_HIVE}). Removing..."
    ; /S = silent. ExecWait 는 끝날 때까지 블록. 실패해도 (코드 무시) 새 설치는 진행.
    ExecWait '$R0 /S'
    Sleep 600
  ${EndIf}
  Pop $R0
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; 옛 productName 들 — 새 이름 추가 시 여기에 한 줄 더.
  !insertmacro RemoveOldVersion HKCU "vibe-diary"
  !insertmacro RemoveOldVersion HKLM "vibe-diary"
!macroend
