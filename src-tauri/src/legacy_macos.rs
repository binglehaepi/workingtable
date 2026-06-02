#![cfg(target_os = "macos")]

// macOS: productName 변경(vibe-diary → todoary) 후 Applications에 옛 .app 이 남는 문제.
// Windows는 installer-hooks.nsh 가 처리. mac 은 NSIS 훅이 없어 첫 실행 1회 Rust 로 정리.
// bundle identifier(app.vibe-diary)가 같을 때만 삭제 — 다른 앱 오삭제 방지.

use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const LEGACY_APP_NAME: &str = "vibe-diary.app";
const LEGACY_BUNDLE_ID: &str = "app.vibe-diary";
const LEGACY_PROCESS_NAME: &str = "vibe-diary";
const MARKER_FILE: &str = ".removed_legacy_vibe_diary_app";

pub fn remove_legacy_vibe_diary_app_once(app: &tauri::AppHandle) {
    let Ok(data_dir) = app.path().app_local_data_dir() else {
        return;
    };
    let marker = data_dir.join(MARKER_FILE);
    if marker.exists() {
        return;
    }

    let current = current_app_bundle();
    let mut removed_any = false;

    for apps_dir in legacy_applications_dirs() {
        let legacy = apps_dir.join(LEGACY_APP_NAME);
        if try_remove_legacy_bundle(&legacy, current.as_deref()) {
            removed_any = true;
        }
    }

    if removed_any {
        eprintln!("legacy macOS cleanup: removed {LEGACY_APP_NAME}");
    }

    // 실패해도 재시도 폭주 방지 — 없었으면 no-op 으로 마킹
    let _ = std::fs::write(&marker, "1");
}

fn legacy_applications_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![PathBuf::from("/Applications")];
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        dirs.push(home.join("Applications"));
    }
    dirs
}

fn current_app_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut path = exe.as_path();
    // …/todoary.app/Contents/MacOS/todoary
    for _ in 0..6 {
        if path.extension().is_some_and(|e| e == "app") {
            return Some(path.to_path_buf());
        }
        path = path.parent()?;
    }
    None
}

fn try_remove_legacy_bundle(legacy: &Path, current: Option<&Path>) -> bool {
    if !legacy.is_dir() {
        return false;
    }

    if let Some(cur) = current {
        if paths_same(cur, legacy) {
            return false;
        }
    }

    let Some(id) = bundle_identifier(legacy) else {
        eprintln!("legacy macOS cleanup: skip {:?} (no bundle id)", legacy);
        return false;
    };
    if id != LEGACY_BUNDLE_ID {
        eprintln!("legacy macOS cleanup: skip {:?} (bundle id {id})", legacy);
        return false;
    }

    let _ = Command::new("/usr/bin/killall")
        .arg(LEGACY_PROCESS_NAME)
        .status();

    match std::fs::remove_dir_all(legacy) {
        Ok(()) => true,
        Err(e) => {
            eprintln!("legacy macOS cleanup: failed to remove {:?}: {e}", legacy);
            false
        }
    }
}

fn paths_same(a: &Path, b: &Path) -> bool {
    std::fs::canonicalize(a)
        .ok()
        .zip(std::fs::canonicalize(b).ok())
        .map(|(a, b)| a == b)
        .unwrap_or(false)
}

fn bundle_identifier(app: &Path) -> Option<String> {
    let info = app.join("Contents/Info");
    let output = Command::new("/usr/bin/defaults")
        .arg("read")
        .arg(&info)
        .arg("CFBundleIdentifier")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}
