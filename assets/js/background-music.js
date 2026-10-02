/**
 * Musique de fond — MP3 direct ou YouTube (iframe API)
 */
const BackgroundMusic = (() => {
    let audio = null;
    let youtubePlayer = null;
    let youtubeReady = null;
    let youtubeVideoId = null;
    let youtubePlayerReady = false;
    let youtubeSetupPromise = null;
    let youtubeSetupId = null;
    let playbackMode = "none";
    let settings = {
        backgroundMusicUrl: "",
        backgroundMusicVolume: 0.35,
        backgroundMusicEnabled: true
    };
    let userPaused = false;
    let wantAutoplay = false;
    let interactionWired = false;
    let wired = false;

    function getAudio() {
        if (!audio) audio = document.getElementById("background-music");
        return audio;
    }

    function clampVolume(v) {
        const n = Number(v);
        if (Number.isNaN(n)) return 0.35;
        return Math.min(1, Math.max(0, n));
    }

    function parseYouTubeId(url) {
        const raw = (url || "").trim();
        if (!raw) return null;
        const patterns = [
            /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/
        ];
        for (const pattern of patterns) {
            const match = raw.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    function loadYouTubeApi() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (youtubeReady) return youtubeReady;
        youtubeReady = new Promise((resolve) => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof prev === "function") prev();
                resolve();
            };
            if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
            const script = document.createElement("script");
            script.src = "https://www.youtube.com/iframe_api";
            script.async = true;
            document.head.appendChild(script);
        });
        return youtubeReady;
    }

    function destroyYouTubePlayer() {
        if (youtubePlayer && typeof youtubePlayer.destroy === "function") {
            try { youtubePlayer.destroy(); } catch (e) {}
        }
        youtubePlayer = null;
        youtubeVideoId = null;
        youtubePlayerReady = false;
    }

    function stopAudioElement() {
        const el = getAudio();
        if (!el || !el.getAttribute("src")) return;
        el.pause();
        el.removeAttribute("src");
        el.load();
    }

    function prepareAudioElement() {
        const el = getAudio();
        if (!el || !settings.backgroundMusicUrl) return null;
        el.preload = "auto";
        el.volume = settings.backgroundMusicVolume;
        if (el.getAttribute("src") !== settings.backgroundMusicUrl) {
            el.src = settings.backgroundMusicUrl;
            el.loop = true;
            el.load();
        }
        return el;
    }

    function setupYouTubePlayer(videoId) {
        if (youtubePlayerReady && youtubePlayer && youtubeVideoId === videoId) return Promise.resolve();
        if (youtubeSetupPromise && youtubeSetupId === videoId) return youtubeSetupPromise;
        youtubeSetupId = videoId;
        youtubeSetupPromise = createYouTubePlayer(videoId).finally(() => {
            if (youtubeSetupId === videoId) {
                youtubeSetupPromise = null;
                youtubeSetupId = null;
            }
        });
        return youtubeSetupPromise;
    }

    async function createYouTubePlayer(videoId) {
        await loadYouTubeApi();
        if (!settings.backgroundMusicEnabled || parseYouTubeId(settings.backgroundMusicUrl) !== videoId) return;
        let host = document.getElementById("youtube-music-host");
        if (!host) {
            host = document.createElement("div");
            host.id = "youtube-music-host";
            host.className = "youtube-music-host";
            document.body.appendChild(host);
        }
        if (youtubePlayer && youtubeVideoId === videoId) return;
        destroyYouTubePlayer();
        youtubeVideoId = videoId;
        host.innerHTML = "";
        const inner = document.createElement("div");
        inner.id = "youtube-music-player";
        host.appendChild(inner);
        await new Promise((resolve) => {
            youtubePlayer = new YT.Player("youtube-music-player", {
                videoId,
                playerVars: {
                    autoplay: 0,
                    controls: 0,
                    disablekb: 1,
                    fs: 0,
                    loop: 1,
                    playlist: videoId,
                    modestbranding: 1,
                    rel: 0,
                    playsinline: 1
                },
                events: {
                    onReady: (event) => {
                        youtubePlayerReady = true;
                        event.target.setVolume(Math.round(settings.backgroundMusicVolume * 100));
                        if (settings.backgroundMusicEnabled && wantAutoplay && !userPaused) {
                            try { event.target.playVideo(); } catch (e) {}
                        }
                        resolve();
                    },
                    onStateChange: updateToggleUi,
                    onAutoplayBlocked: ensureInteractionRetry,
                    onError: () => { resolve(); }
                }
            });
        });
    }

    function isPlaying() {
        if (playbackMode === "youtube") return isYouTubePlaying();
        if (playbackMode === "audio") {
            const el = getAudio();
            return !!(el && !el.paused && !el.ended);
        }
        return false;
    }

    function ensureInteractionRetry() {
        if (interactionWired || userPaused || !wantAutoplay) return;
        interactionWired = true;
        const retry = (event) => {
            if (event?.target?.closest?.('#music-toggle-btn')) return;
            if (!settings.backgroundMusicEnabled || userPaused || !wantAutoplay || isPlaying()) return;
            void play();
        };
        document.addEventListener("touchend", retry, { passive: true });
        document.addEventListener("click", retry);
        document.addEventListener("keydown", retry, { passive: true });
    }

    async function tryAutoplay(force = false) {
        if (!settings.backgroundMusicUrl || !settings.backgroundMusicEnabled) return false;
        if (userPaused && !force) return false;
        wantAutoplay = true;
        ensureInteractionRetry();
        const ok = await play();
        if (!ok && wantAutoplay && !userPaused) ensureInteractionRetry();
        return ok;
    }

    function apply(state) {
        if (!state) return;
        settings = {
            backgroundMusicUrl: state.backgroundMusicUrl || "",
            backgroundMusicVolume: clampVolume(state.backgroundMusicVolume ?? 0.35),
            backgroundMusicEnabled: state.backgroundMusicEnabled !== false && state.sections?.music !== false
        };

        const btn = document.getElementById("music-toggle-btn");
        const hasTrack = Boolean(settings.backgroundMusicUrl);
        const ytId = parseYouTubeId(settings.backgroundMusicUrl);

        if (!hasTrack || !settings.backgroundMusicEnabled) {
            wantAutoplay = false;
            stopAudioElement();
            if (youtubePlayer?.pauseVideo) youtubePlayer.pauseVideo();
            destroyYouTubePlayer();
            playbackMode = "none";
            if (btn) btn.classList.add("hidden");
            updateToggleUi();
            return;
        }

        if (btn) btn.classList.remove("hidden");

        if (ytId) {
            stopAudioElement();
            playbackMode = "youtube";
            if (youtubePlayer && youtubeVideoId !== ytId) destroyYouTubePlayer();
            // L'iframe se charge pendant la lecture de la porte : elle est prête
            // quand l'invité touche l'enveloppe ou le bouton de musique.
            void setupYouTubePlayer(ytId).catch(() => {});
            // La configuration peut changer après l'entrée (aperçu ou édition).
            // Dans ce cas seulement, initialise la nouvelle piste YouTube.
            if (wantAutoplay && !userPaused) void play();
        } else {
            destroyYouTubePlayer();
            playbackMode = "audio";
            const el = prepareAudioElement();
            if (el) {
                el.volume = settings.backgroundMusicVolume;
            }
            if (wantAutoplay && !userPaused) void play();
        }
        updateToggleUi();
    }

    function isYouTubePlaying() {
        if (!youtubePlayer || typeof youtubePlayer.getPlayerState !== "function") return false;
        return youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
    }

    function updateToggleUi() {
        const btn = document.getElementById("music-toggle-btn");
        if (!btn) return;
        const playing = isPlaying();
        btn.setAttribute("aria-pressed", playing ? "true" : "false");
        btn.setAttribute("title", playing ? "Couper la musique" : "Lancer la musique");
        btn.setAttribute("aria-label", playing ? "Couper la musique" : "Lancer la musique");
        const icon = btn.querySelector(".music-toggle-icon");
        if (icon) icon.textContent = playing ? "♫" : "♪";
    }

    async function play() {
        if (!settings.backgroundMusicUrl || !settings.backgroundMusicEnabled) return false;
        if (userPaused) return false;
        if (isPlaying()) return true;
        try {
            if (playbackMode === "youtube") {
                const ytId = parseYouTubeId(settings.backgroundMusicUrl);
                if (!ytId) return false;
                // Préserver le geste utilisateur lorsque le lecteur est déjà prêt.
                if (!youtubePlayerReady || youtubeVideoId !== ytId) await setupYouTubePlayer(ytId);
                if (!settings.backgroundMusicEnabled || userPaused || parseYouTubeId(settings.backgroundMusicUrl) !== ytId || !youtubePlayer) return false;
                youtubePlayer.setVolume(Math.round(settings.backgroundMusicVolume * 100));
                youtubePlayer.playVideo();
            } else if (playbackMode === "audio") {
                const el = prepareAudioElement();
                if (!el) return false;
                await el.play();
                if (!settings.backgroundMusicEnabled || userPaused) {
                    el.pause();
                    return false;
                }
            } else {
                const ytId = parseYouTubeId(settings.backgroundMusicUrl);
                if (ytId) {
                    playbackMode = "youtube";
                    return play();
                }
                playbackMode = "audio";
                const el = prepareAudioElement();
                if (!el) return false;
                await el.play();
                if (!settings.backgroundMusicEnabled || userPaused) {
                    el.pause();
                    return false;
                }
            }
            updateToggleUi();
            return true;
        } catch (error) {
            updateToggleUi();
            if (!userPaused) ensureInteractionRetry();
            return false;
        }
    }

    function pause() {
        if (playbackMode === "youtube" && youtubePlayer && youtubePlayer.pauseVideo) {
            youtubePlayer.pauseVideo();
        } else {
            const el = getAudio();
            if (el) el.pause();
        }
        updateToggleUi();
    }

    function toggle() {
        if (!settings.backgroundMusicUrl || !settings.backgroundMusicEnabled) return;
        const playing = playbackMode === "youtube" ? isYouTubePlaying() : (() => {
            const el = getAudio();
            return !!(el && !el.paused);
        })();
        if (playing) {
            userPaused = true;
            wantAutoplay = false;
            pause();
        } else {
            userPaused = false;
            wantAutoplay = true;
            ensureInteractionRetry();
            void play();
        }
    }

    function readPausedPreference() {
        const eventId = window.EventConfig && EventConfig.getEventId
            ? EventConfig.getEventId()
            : "default";
        try { return sessionStorage.getItem(`wedding_event_${eventId}_music_paused`) === "1"; }
        catch { return userPaused; }
    }

    function savePausedPreference() {
        const eventId = window.EventConfig && EventConfig.getEventId
            ? EventConfig.getEventId()
            : "default";
        try { sessionStorage.setItem(`wedding_event_${eventId}_music_paused`, userPaused ? "1" : "0"); } catch {}
    }

    function armAutoplay() {
        if (!settings.backgroundMusicEnabled) return;
        userPaused = readPausedPreference();
        if (userPaused) return;
        wantAutoplay = true;
        ensureInteractionRetry();
        if (!isPlaying()) void tryAutoplay();
    }

    function onGuestEnter() {
        if (!settings.backgroundMusicEnabled) return;
        userPaused = readPausedPreference();
        if (userPaused) return;
        wantAutoplay = true;
        if (!isPlaying()) void tryAutoplay();
    }

    function wireControls() {
        if (wired) return;
        wired = true;
        const btn = document.getElementById("music-toggle-btn");
        if (btn) {
            btn.addEventListener("click", () => {
                toggle();
                savePausedPreference();
            });
        }
        const el = getAudio();
        if (el) {
            el.addEventListener("play", updateToggleUi);
            el.addEventListener("pause", updateToggleUi);
            el.addEventListener("ended", updateToggleUi);
        }
        const gate = document.getElementById("welcome-gate");
        if (gate) {
            const startAtGate = () => armAutoplay();
            gate.addEventListener("pointerdown", startAtGate, { passive: true });
            gate.addEventListener("touchend", startAtGate, { passive: true });
            gate.addEventListener("click", startAtGate);
            gate.addEventListener("keydown", startAtGate);
        }
    }

    function init() {
        wireControls();
    }

    return {
        apply,
        play,
        pause,
        toggle,
        armAutoplay,
        onGuestEnter,
        init,
        parseYouTubeId,
        getSettings: () => ({ ...settings })
    };
})();

window.BackgroundMusic = BackgroundMusic;
