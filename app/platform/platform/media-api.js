(function () {
    if (typeof window === 'undefined') return;
    if (window.mediaAPI) return; // Electron preload already provided it

    let videoEl = null;
    let hlsInstance = null;
    let subtitles = [];

    function getEls() {
        return {
            overlay: document.getElementById('playerOverlay'),
            host: document.getElementById('playerVideoHost'),
            title: document.getElementById('playerTitle'),
        };
    }

    function setOverlayActive(active) {
        const { overlay } = getEls();
        if (!overlay) return;
        overlay.classList.toggle('isActive', !!active);
        overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
    }

    async function setFullscreen(value) {
        try {
            if (value) {
                const { overlay } = getEls();
                const target = overlay || document.documentElement;
                if (!document.fullscreenElement && target?.requestFullscreen) {
                    await target.requestFullscreen();
                }
            } else {
                if (document.fullscreenElement && document.exitFullscreen) {
                    await document.exitFullscreen();
                }
            }
        } catch {
            // Best-effort; mobile browsers often restrict fullscreen.
        }
    }

    function openExternal(url) {
        try {
            window.open(String(url), '_blank', 'noopener,noreferrer');
        } catch {
            // ignore
        }
        return Promise.resolve();
    }

    function destroyHls() {
        try {
            if (hlsInstance) {
                hlsInstance.destroy();
            }
        } catch {
            // ignore
        }
        hlsInstance = null;
    }

    function isM3u8(url) {
        return /\.m3u8(\?|$)/i.test(String(url || ''));
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = Array.from(document.getElementsByTagName('script')).find(s => s.src === src);
            if (existing) return resolve();

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = (e) => reject(e);
            document.head.appendChild(script);
        });
    }

    async function ensureHls() {
        if (window.Hls) return window.Hls;
        // Keep consistent with existing TV embedded player approach in index.html
        await loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.light.min.js');
        return window.Hls;
    }

    async function ensureVideoElement() {
        const { host } = getEls();
        if (!host) throw new Error('Missing #playerVideoHost');

        if (!videoEl || !videoEl.isConnected) {
            host.innerHTML = '';
            videoEl = document.createElement('video');
            videoEl.style.width = '100%';
            videoEl.style.height = '100%';
            videoEl.style.display = 'block';
            videoEl.style.background = '#000';
            videoEl.playsInline = true;
            videoEl.preload = 'auto';
            videoEl.controls = false;
            host.appendChild(videoEl);
        }

        return videoEl;
    }

    async function setSource(url) {
        const video = await ensureVideoElement();

        destroyHls();

        // Reset tracks on every play
        try {
            Array.from(video.querySelectorAll('track')).forEach(t => t.remove());
        } catch {
            // ignore
        }

        const src = String(url || '').trim();
        if (!src) throw new Error('Missing media url');

        if (isM3u8(src)) {
            const canNativeHls = !!video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl') !== '';
            if (canNativeHls) {
                video.src = src;
            } else {
                const Hls = await ensureHls();
                if (Hls && Hls.isSupported && Hls.isSupported()) {
                    hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
                    hlsInstance.loadSource(src);
                    hlsInstance.attachMedia(video);
                } else {
                    // Last resort: try direct src
                    video.src = src;
                }
            }
        } else {
            video.src = src;
        }
    }

    function getProp(name) {
        if (!videoEl) return null;
        switch (String(name)) {
            case 'duration':
                return Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
            case 'time-pos':
                return Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
            case 'volume':
                return Math.round((Number(videoEl.volume) || 1) * 100);
            case 'pause':
                return !!videoEl.paused;
            default:
                return null;
        }
    }

    async function cmd(name, ...args) {
        const c = String(name || '');
        const video = await ensureVideoElement();

        if (c === 'getProperty') {
            return { value: getProp(args[0]) };
        }

        if (c === 'cyclePause') {
            if (video.paused) await video.play();
            else video.pause();
            return { ok: true };
        }

        if (c === 'seek') {
            const delta = Number(args[0] || 0);
            video.currentTime = Math.max(0, (Number(video.currentTime) || 0) + delta);
            return { ok: true };
        }

        if (c === 'seekTo') {
            const abs = Number(args[0] || 0);
            video.currentTime = Math.max(0, abs);
            return { ok: true };
        }

        if (c === 'setVolume') {
            const vol = Math.max(0, Math.min(100, Number(args[0] ?? 100)));
            video.volume = vol / 100;
            return { ok: true };
        }

        if (c === 'setProperty') {
            const prop = String(args[0] || '');
            const val = args[1];
            if (prop === 'time-pos') {
                video.currentTime = Math.max(0, Number(val || 0));
                return { ok: true };
            }
            return { ok: false, error: 'Unsupported property' };
        }

        return { ok: false, error: 'Unsupported command' };
    }

    async function play(content) {
        const url = typeof content === 'string' ? content : content?.url;
        const title = typeof content === 'object' ? (content?.title || content?.name || '') : '';

        const { title: titleEl } = getEls();
        if (titleEl) titleEl.textContent = title || 'Playing';

        setOverlayActive(true);
        await setSource(url);

        const video = await ensureVideoElement();
        try {
            await video.play();
        } catch (e) {
            // Autoplay restrictions are common; user can hit Play/Pause.
        }

        return { ok: true, mode: 'html5' };
    }

    async function stop() {
        try {
            if (videoEl) {
                videoEl.pause();
                videoEl.removeAttribute('src');
                videoEl.load();
            }
        } catch {
            // ignore
        }
        destroyHls();
        subtitles = [];
        return { ok: true };
    }

    async function initSubtitles(list) {
        subtitles = Array.isArray(list) ? list : [];
        return { ok: true };
    }

    async function getSubtitles() {
        return { ok: true, subtitles };
    }

    async function loadSubtitle(index) {
        const video = await ensureVideoElement();
        const idx = Number(index);
        if (!Number.isFinite(idx) || idx < 0 || idx >= subtitles.length) {
            return { ok: false, error: 'Invalid subtitle index' };
        }

        const sub = subtitles[idx];
        const src = String(sub?.url || sub?.src || '').trim();
        if (!src) return { ok: false, error: 'Subtitle missing url' };

        // NOTE: most WebViews reliably support VTT. SRT may not render.
        try {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = String(sub?.name || sub?.lang || `Sub ${idx + 1}`);
            track.srclang = String(sub?.lang || 'en');
            track.src = src;
            track.default = true;

            // Remove old tracks
            Array.from(video.querySelectorAll('track')).forEach(t => t.remove());
            video.appendChild(track);

            // Enable the first (and only) text track
            setTimeout(() => {
                try {
                    const tt = video.textTracks;
                    for (let i = 0; i < tt.length; i++) tt[i].mode = 'disabled';
                    if (tt[0]) tt[0].mode = 'showing';
                } catch {
                    // ignore
                }
            }, 0);
        } catch {
            return { ok: false, error: 'Failed to attach subtitle track' };
        }

        return { ok: true };
    }

    window.mediaAPI = {
        openExternal,
        app: {
            setFullscreen,
            setPlayerFocusable: async () => ({ ok: true }),
            showMainWindow: async () => ({ ok: true }),
        },
        player: {
            play,
            stop,
            command: cmd,
            initSubtitles,
            loadSubtitle,
            getSubtitles,
            onSubtitlesReady: () => {},
        },
    };
})();
