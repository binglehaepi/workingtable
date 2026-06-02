/* global YT */
// Global YouTube music controller.
// Tauri WebViews can differ by platform and WebView version. Some reject the
// YouTube IFrame API origin/postMessage handshake even though a plain embed can
// still play after a user gesture. Start with the plain embed in app/custom
// protocol contexts, and fall back to it if the API path stalls or errors.
(function () {
  const loc = (typeof window !== "undefined" && window.location) || {};
  const origin = loc.origin || "";
  const protocol = loc.protocol || "";
  const isTauriLike = !!(window.__TAURI__ || window.__TAURI_INTERNALS__) ||
    /^(tauri|asset):$/i.test(protocol) ||
    /^https?:\/\/tauri\.localhost(?::\d+)?$/i.test(origin);
  const shouldStartRaw = isTauriLike || protocol === "file:";
  const tauriInvoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;

  let useNativeMode = isTauriLike && !!tauriInvoke;
  let useRawMode = shouldStartRaw && !useNativeMode;
  let player = null;
  let ready = false;
  let queue = [];
  let index = 0;
  let started = false;
  let wantPlay = false;
  let apiTimer = null;
  let readyTimer = null;
  const state = {
    playing: false,
    title: "",
    videoId: null,
    hasQueue: false,
    volume: volume,
    debug: "",
    nativeMode: useNativeMode,
  };
  const subs = new Set();
  const VOLUME_KEY = "todoary.music.volume";

  function loadVolume() {
    try {
      const v = parseInt(localStorage.getItem(VOLUME_KEY), 10);
      if (Number.isFinite(v) && v >= 0 && v <= 100) return v;
    } catch (_) {}
    return 100;
  }

  let volume = loadVolume();

  const emit = () => { for (const fn of subs) fn(); };
  const setDebug = (msg) => { state.debug = msg ? String(msg).slice(0, 90) : ""; emit(); };

  function applyVolume() {
    if (useNativeMode) {
      invokeNative("youtube_player_set_volume", { volume: volume / 100 }).catch(() => {});
      return;
    }
    if (useRawMode) {
      if (volume <= 0) rawPostCommand("mute");
      else {
        rawPostCommand("unMute");
        rawPostCommand("setVolume", [volume]);
      }
      return;
    }
    if (player) {
      try {
        if (volume <= 0) player.mute();
        else {
          player.unMute();
          player.setVolume(volume);
        }
      } catch (_) {}
    }
  }

  function invokeNative(command, args) {
    if (!tauriInvoke) return Promise.reject(new Error("tauri invoke unavailable"));
    return tauriInvoke(command, args || {});
  }

  // 검증 빌드 (③): path 비디오를 playlist 첫 번째에도 넣는다.
  // YouTube embed가 path를 무시하고 playlist[0]부터 재생하는 환경 대응.
  // 공식 시맨틱("path 먼저, 그 다음 playlist") 환경에서는 첫 곡이 두 번 재생될
  // 수 있음 — 그게 관측되면 path-honor 환경이라는 증거.
  function playlistAfter(startIdx) {
    const rest = [];
    for (let k = 0; k < queue.length; k++) {
      rest.push(queue[(startIdx + k) % queue.length].videoId);
    }
    return rest;
  }

  function fallbackToRaw(reason) {
    useNativeMode = false;
    useRawMode = true;
    setDebug("raw iframe fallback" + (reason ? " - " + reason : ""));
    if (queue.length && wantPlay) {
      state.playing = true;
      rawCreateIframe(index);
    }
  }

  function nativePlay(startIdx) {
    const cur = queue[startIdx];
    if (!cur) return;
    state.playing = true;
    setDebug("native macOS player");
    emit();
    invokeNative("youtube_player_play", {
      videoId: cur.videoId,
      playlist: playlistAfter(startIdx),
    }).then(() => {
      setTimeout(applyVolume, 400);
    }).catch(err => {
      fallbackToRaw(err && err.message ? err.message : err);
      state.nativeMode = false;
    });
  }

  function host() {
    let el = document.getElementById("yt-music-host");
    if (!el) {
      const wrap = document.createElement("div");
      // opacity:0 — iframe은 살아있어서 오디오는 재생되지만 보이지 않음.
      // 윈도우 창이 transparent라 0.08만 줘도 바탕화면 위로 썸네일이 새어 나옴.
      wrap.style.cssText =
        "position:fixed;right:0;bottom:0;width:356px;height:200px;opacity:0;" +
        "pointer-events:none;z-index:0;overflow:hidden;";
      el = document.createElement("div");
      el.id = "yt-music-host";
      wrap.appendChild(el);
      document.body.appendChild(wrap);
    }
    return el;
  }

  function clearTimers() {
    if (apiTimer) clearTimeout(apiTimer);
    if (readyTimer) clearTimeout(readyTimer);
    apiTimer = null;
    readyTimer = null;
  }

  function rawGetIframe() {
    return document.getElementById("yt-music-iframe");
  }

  function rawPostCommand(func, args) {
    const iframe = rawGetIframe();
    if (!iframe || !iframe.contentWindow) return false;
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: func, args: args || "" }),
        "*"
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function rawRemoveIframe() {
    const it = rawGetIframe();
    if (it && it.parentNode) it.parentNode.removeChild(it);
  }

  function rawCreateIframe(startIdx) {
    rawRemoveIframe();
    if (!queue.length) return;

    const cur = queue[startIdx];
    const embedOrigin = /^https?:\/\//i.test(origin) ? origin : "https://tauri.localhost";
    // 검증 빌드 (③): path 비디오를 playlist 첫 번째에도 포함.
    // playlistAfter() 의 주석 참고.
    const rest = [];
    for (let k = 0; k < queue.length; k++) {
      rest.push(queue[(startIdx + k) % queue.length].videoId);
    }

    const params = new URLSearchParams({
      autoplay: "1",
      playsinline: "1",
      controls: "0",
      disablekb: "1",
      rel: "0",
      modestbranding: "1",
      iv_load_policy: "3",
      enablejsapi: "1",
      origin: embedOrigin,
      widget_referrer: embedOrigin,
    });
    if (rest.length) params.set("playlist", rest.join(","));

    const iframe = document.createElement("iframe");
    iframe.id = "yt-music-iframe";
    iframe.src = "https://www.youtube.com/embed/" + cur.videoId + "?" + params.toString();
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.setAttribute("frameborder", "0");
    iframe.style.cssText = "width:100%;height:100%;border:0;";
    host().appendChild(iframe);
    setTimeout(applyVolume, 800);
  }

  function switchToRaw(reason) {
    if (useRawMode) return;
    useNativeMode = false;
    useRawMode = true;
    state.nativeMode = false;
    clearTimers();
    try { if (player && player.destroy) player.destroy(); } catch (_) {}
    player = null;
    ready = false;
    setDebug("raw iframe fallback" + (reason ? " · " + reason : ""));
    if (queue.length && wantPlay) {
      state.playing = true;
      rawCreateIframe(index);
    }
  }

  function ensure() {
    if (useNativeMode || useRawMode || player) return;
    if (window.YT && window.YT.Player) {
      setDebug("creating");
      create();
      return;
    }
    if (document.getElementById("__yt_api")) {
      setDebug("api loading");
      if (!apiTimer) apiTimer = setTimeout(() => switchToRaw("api timeout"), 5000);
      return;
    }

    setDebug("api loading");
    const s = document.createElement("script");
    s.id = "__yt_api";
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => switchToRaw("api load failed");
    document.head.appendChild(s);

    apiTimer = setTimeout(() => switchToRaw("api timeout"), 5000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (prev) { try { prev(); } catch (_) {} }
      if (useRawMode) return;
      if (apiTimer) clearTimeout(apiTimer);
      apiTimer = null;
      setDebug("creating");
      create();
    };
  }

  function create() {
    if (player || useRawMode) return;
    const playerVars = {
      autoplay: 1,
      mute: 1,
      controls: 0,
      disablekb: 1,
      playsinline: 1,
      enablejsapi: 1,
    };
    if (/^https?:\/\//i.test(origin)) playerVars.origin = origin;

    readyTimer = setTimeout(() => {
      if (!ready) switchToRaw("ready timeout");
    }, 5000);

    player = new YT.Player(host(), {
      height: "200",
      width: "356",
      playerVars,
      events: {
        onReady: function () {
          ready = true;
          if (readyTimer) clearTimeout(readyTimer);
          readyTimer = null;
          setDebug("ready");
          if (queue.length && wantPlay) {
            const tr = queue[index] || queue[0];
            try { player.loadVideoById(tr.videoId); } catch (_) {}
            applyVolume();
            try { player.playVideo(); } catch (_) {}
          } else if (queue.length && !started) {
            const tr = queue[index] || queue[0];
            try { player.cueVideoById(tr.videoId); } catch (_) {}
          }
        },
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.ENDED) { play(index + 1); return; }
          state.playing = e.data === YT.PlayerState.PLAYING;
          try {
            const d = player.getVideoData();
            if (d && d.title) state.title = d.title;
          } catch (_) {}
          emit();
        },
        onError: function (e) {
          const code = e && e.data;
          setDebug("yt err " + code + " · " + (state.videoId || "?"));
          if ([100, 101, 150, 153].indexOf(code) >= 0) {
            switchToRaw("yt err " + code);
          } else if (queue.length > 1) {
            setTimeout(() => play(index + 1, true), 600);
          }
        },
      },
    });
  }

  function unmuteSoon() {
    applyVolume();
  }

  function play(i, gesture) {
    if (!queue.length) return;
    index = ((i % queue.length) + queue.length) % queue.length;
    const tr = queue[index];
    state.videoId = tr.videoId;
    state.title = tr.title || "Playing";
    state.hasQueue = true;
    started = true;
    wantPlay = true;

    if (useNativeMode) {
      nativePlay(index);
      return;
    }

    if (useRawMode) {
      state.playing = true;
      setDebug("raw iframe" + (queue.length > 1 ? " · autoplay queue" : ""));
      emit();
      rawCreateIframe(index);
      return;
    }

    emit();
    ensure();
    // 재생 카운트 — 곡 시작 시점에 한 번
    try {
      if (window.diary && window.diary.actions && window.diary.actions.recordPlay) {
        window.diary.actions.recordPlay({ videoId: tr.videoId, title: tr.title });
      }
    } catch (_) {}
    if (ready && player) {
      try { player.loadVideoById(tr.videoId); } catch (_) {}
      if (gesture) {
        applyVolume();
        try { player.playVideo(); } catch (_) {}
      }
    }
  }

  function queueSame(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].videoId !== b[i].videoId) return false;
    }
    return true;
  }

  window.musicPlayer = {
    setQueue(tracks) {
      const next = (tracks || []).map(t => ({ videoId: t.videoId, title: t.title }));
      const unchanged = queueSame(queue, next);
      queue = next;
      state.hasQueue = queue.length > 0;
      if (unchanged) {
        for (let i = 0; i < queue.length; i++) {
          if (next[i].title) queue[i].title = next[i].title;
        }
        emit();
        return;
      }
      if (!queue.length) {
        state.title = "";
        state.videoId = null;
        state.playing = false;
        rawRemoveIframe();
        if (useNativeMode) invokeNative("youtube_player_stop").catch(() => {});
      }
      if (index >= queue.length) index = 0;
      if (useNativeMode && state.playing && queue.length) {
        nativePlay(index);
      } else if (useRawMode && state.playing && queue.length) {
        rawCreateIframe(index);
      }
      emit();
      if (queue.length && !useNativeMode && !useRawMode) ensure();
    },
    play(videoId) {
      const i = queue.findIndex(t => t.videoId === videoId);
      if (i >= 0) play(i, true);
      else if (!useNativeMode && !useRawMode) ensure();
    },
    toggle() {
      if (useNativeMode) {
        if (state.playing) {
          invokeNative("youtube_player_pause").catch(err => fallbackToRaw(err));
          state.playing = false;
          setDebug("paused");
          emit();
        } else if (queue.length) {
          invokeNative("youtube_player_resume").then(() => {
            applyVolume();
          }).catch(err => {
            fallbackToRaw(err);
            play(index, true);
          });
          state.playing = true;
          setDebug("playing");
          emit();
        }
        return;
      }

      if (useRawMode) {
        if (state.playing) {
          if (!rawPostCommand("pauseVideo")) rawRemoveIframe();
          state.playing = false;
          setDebug("paused");
          emit();
        } else if (queue.length) {
          if (rawGetIframe() && rawPostCommand("playVideo")) {
            state.playing = true;
            setDebug("playing");
            emit();
          } else {
            play(index, true);
          }
        }
        return;
      }

      ensure();
      unmuteSoon();
      if (!ready || !player) {
        if (queue.length) play(index, true);
        return;
      }
      const st = player.getPlayerState && player.getPlayerState();
      if (st === 1) player.pauseVideo();
      else if (state.videoId) player.playVideo();
      else if (queue.length) play(index, true);
    },
    next() { if (queue.length) play(index + 1, true); },
    prev() { if (queue.length) play(index - 1, true); },
    setNativeViewport(rect) {
      if (!useNativeMode) return;
      invokeNative("youtube_player_set_bounds", rect).catch(err => fallbackToRaw(err));
    },
    getVolume() { return volume; },
    setVolume(v) {
      volume = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      state.volume = volume;
      try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch (_) {}
      applyVolume();
      emit();
    },
    getState() { return state; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };

  if (useRawMode) setDebug("raw iframe mode");
})();
