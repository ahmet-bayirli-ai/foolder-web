// Web-safe native player stubs (no Capacitor)
window.__nativePlayerActive = false;
window.__nativePlayerStarting = false;
window.__nativePlayerListenersAttached = true;

window.playNativeVideo = async () => {
  return { ok: false, error: 'Native player not available in web' };
};

window.exitNativeVideo = async () => {
  return { ok: false, error: 'Native player not available in web' };
};
