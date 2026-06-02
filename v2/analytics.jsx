/* global firebase */
// ===========================================================
// analytics — 익명 활성 사용자 집계 (DAU/MAU)
//
// • 앱 실행 시 1회만 신호 전송 (주기/heartbeat 없음)
// • 작업방(firebase-bridge)과 완전 분리 — Firestore rooms/* 미사용
// • 1순위: Firebase Analytics (무료, Firestore 비용 없음)
// • 2순위: Firestore stats/daily/* (Analytics 실패 시, 기기당 하루 1 write)
// ===========================================================

(function () {
  if (window.todoaryAnalytics) return;

  let launchTracked = false;

  const DEVICE_ID_KEY = "todoary.analytics.deviceId";
  const DAILY_SENT_KEY = "todoary.analytics.dailySent";

  const log = (...a) => { try { console.log("[analytics]", ...a); } catch (_) {} };
  const warn = (...a) => { try { console.warn("[analytics]", ...a); } catch (_) {} };

  function hasConfig() {
    const c = window.FIREBASE_CONFIG || {};
    return !!(c.apiKey && c.projectId);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = (typeof crypto !== "undefined" && crypto.randomUUID)
          ? crypto.randomUUID()
          : "d-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch (_) {
      return "d-anon";
    }
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error("script load failed: " + src));
      document.head.appendChild(s);
    });
  }

  function sdkBase() {
    const v = window.FIREBASE_VERSION || "10.13.0";
    return "https://www.gstatic.com/firebasejs/" + v;
  }

  async function ensureAppSDK() {
    if (window.firebase && window.firebase.apps) return;
    await loadScript(sdkBase() + "/firebase-app-compat.js");
  }

  function getOrInitApp() {
    if (firebase.apps.length) return firebase.app();
    return firebase.initializeApp(window.FIREBASE_CONFIG);
  }

  async function ensureFirebaseReady() {
    // 작업방 bridge가 먼저 initializeApp 하도록 대기 (중복 init 충돌 방지)
    if (window.firebaseBridge && window.firebaseBridge.init) {
      try { await window.firebaseBridge.init(); } catch (_) {}
    }
  }

  async function tryAnalytics() {
    const config = window.FIREBASE_CONFIG || {};
    if (!config.measurementId) {
      log("measurementId 없음 — Analytics 건너뜀");
      return false;
    }

    await ensureFirebaseReady();
    if (!window.firebase || !firebase.apps.length) await ensureAppSDK();
    await loadScript(sdkBase() + "/firebase-analytics-compat.js");

    if (!firebase.apps.length) getOrInitApp();
    firebase.analytics().logEvent("app_launch");
    log("Analytics app_launch 전송");
    return true;
  }

  async function ensureAuthAndFirestore() {
    await ensureFirebaseReady();
    const base = sdkBase();
    if (!window.firebase.auth) await loadScript(base + "/firebase-auth-compat.js");
    if (!window.firebase.firestore) await loadScript(base + "/firebase-firestore-compat.js");

    if (!firebase.apps.length) getOrInitApp();
    const auth = firebase.auth();

    if (!auth.currentUser) {
      await new Promise((res, rej) => {
        const unsub = auth.onAuthStateChanged(async (user) => {
          if (user) { unsub(); res(); return; }
          try {
            await auth.signInAnonymously();
          } catch (e) { unsub(); rej(e); }
        });
      });
    }

    return firebase.firestore();
  }

  async function tryFirestoreFallback() {
    if (localStorage.getItem(DAILY_SENT_KEY) === todayStr()) {
      log("오늘 이미 Firestore 집계 전송됨 — 건너뜀");
      return true;
    }

    const db = await ensureAuthAndFirestore();
    const deviceId = getDeviceId();
    const date = todayStr();

    await db
      .doc("stats/daily/" + date)
      .set(
        {
          ["d." + deviceId]: true,
          at: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    try { localStorage.setItem(DAILY_SENT_KEY, date); } catch (_) {}
    log("Firestore fallback 전송:", date, deviceId.slice(0, 8) + "…");
    return true;
  }

  async function trackAppLaunch() {
    if (launchTracked) return;
    launchTracked = true;

    if (!hasConfig()) {
      log("config 없음 — 집계 건너뜀");
      return;
    }

    try {
      if (await tryAnalytics()) return;
    } catch (e) {
      warn("Analytics 실패, Firestore fallback 시도", e);
    }

    try {
      await tryFirestoreFallback();
    } catch (e) {
      warn("Firestore fallback 실패 (무시)", e);
    }
  }

  window.todoaryAnalytics = { trackAppLaunch };
})();
