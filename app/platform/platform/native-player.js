import { CapacitorVideoPlayer } from 'capacitor-video-player';

// Shared flags used by index.html to decide how to handle BACK.
window.__nativePlayerActive = window.__nativePlayerActive || false;
window.__nativePlayerStarting = window.__nativePlayerStarting || false;
window.__nativePlayerListenersAttached = window.__nativePlayerListenersAttached || false;

function isCapacitorNativeAndroid() {
  try {
    const cap = window?.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return false;
    const platform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
    return String(platform || '').toLowerCase() === 'android';
  } catch {
    return false;
  }
}

async function tryPlayNative({ url, title, poster, subtitleUrl } = {}) {
  const u = String(url || '').trim();
  if (!u) return { ok: false, error: 'Missing url' };

  if (!isCapacitorNativeAndroid()) return { ok: false, error: 'Not android native' };

  // Avoid starting multiple fullscreen fragments (e.g. Enter also triggers click on TV).
  if (window.__nativePlayerActive || window.__nativePlayerStarting) {
    return { ok: true, skipped: true };
  }

  const playerId = 'main';

  // Attach listeners once (helps keep state in sync even if playback exits natively).
  if (!window.__nativePlayerListenersAttached) {
    window.__nativePlayerListenersAttached = true;
    try {
      CapacitorVideoPlayer.addListener('jeepCapVideoPlayerReady', () => {
        window.__nativePlayerActive = true;
        window.__nativePlayerStarting = false;
        try { window.dispatchEvent(new CustomEvent('nativePlayerReady')); } catch {}
      });
      CapacitorVideoPlayer.addListener('jeepCapVideoPlayerExit', () => {
        window.__nativePlayerActive = false;
        window.__nativePlayerStarting = false;
        try { window.dispatchEvent(new CustomEvent('nativePlayerExit')); } catch {}
      });
      CapacitorVideoPlayer.addListener('jeepCapVideoPlayerEnded', () => {
        window.__nativePlayerActive = false;
        window.__nativePlayerStarting = false;
        try { window.dispatchEvent(new CustomEvent('nativePlayerEnded')); } catch {}
      });
    } catch {
      // ignore
    }
  }

  try {
    window.__nativePlayerStarting = true;
    window.__nativePlayerActive = false;

    const initRes = await CapacitorVideoPlayer.initPlayer({
      mode: 'fullscreen',
      url: u,
      playerId,
      title: String(title || ''),
      smallTitle: '',
      // NOTE: Do not enable Google Cast integration here.
      // When `chromecast: true`, the plugin initializes CastContext which requires
      // manifest metadata (OPTIONS_PROVIDER_CLASS_NAME). We are running locally
      // on Android/Google TV, so we just want native playback.
      chromecast: false,
      artwork: String(poster || ''),
      subtitle: subtitleUrl ? String(subtitleUrl) : undefined,
      showControls: true,
      exitOnEnd: true,
      pipEnabled: true,
      bkmodeEnabled: true,
      // TV devices should stay landscape.
      displayMode: 'landscape'
    });

    if (initRes && initRes.result === false) {
      window.__nativePlayerActive = false;
      window.__nativePlayerStarting = false;
      return { ok: false, error: initRes.message || 'initPlayer failed' };
    }

    // init succeeded; the fragment should be visible now.
    window.__nativePlayerActive = true;

    // The native fragment auto-starts playback when it reaches STATE_READY.
    return { ok: true };
  } catch (e) {
    window.__nativePlayerActive = false;
    window.__nativePlayerStarting = false;
    return { ok: false, error: e?.message || String(e) };
  }
}

async function exitNativePlayer() {
  if (!isCapacitorNativeAndroid()) return { ok: false, error: 'Not android native' };
  try {
    await CapacitorVideoPlayer.exitPlayer();
    window.__nativePlayerActive = false;
    window.__nativePlayerStarting = false;
    return { ok: true };
  } catch (e) {
    window.__nativePlayerActive = false;
    window.__nativePlayerStarting = false;
    return { ok: false, error: e?.message || String(e) };
  }
}

// Expose a minimal bridge for the non-module app code.
window.playNativeVideo = async (url, opts = {}) => {
  return tryPlayNative({
    url,
    title: opts?.title,
    poster: opts?.poster,
    subtitleUrl: opts?.subtitleUrl
  });
};

window.exitNativeVideo = async () => {
  return exitNativePlayer();
};
