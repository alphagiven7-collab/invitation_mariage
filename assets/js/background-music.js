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
    let youtubeRequest = 0;
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
    let playbackError = false;
    let autoplayBlocked = false;
    let recoveryTimer = null;
    let recoveryAttempts = 0;
    let preferenceKey = null;

    function cancelRecovery() {
        if (recoveryTimer !== null) clearTimeout(recoveryTimer);
        recoveryTimer = null;
    }

    function shouldResume() {
        return settings.backgroundMusicEnabled && settings.backgroundMusicUrl && wantAutoplay && !userPaused;
    }

    function scheduleRecovery() {
        updateToggleUi();
        if (!shouldResume() || recoveryTimer !== null || recoveryAttempts >= 2) return;
        const url = settings.backgroundMusicUrl;
        recoveryTimer = setTimeout(() => {
            recoveryTimer = null;
            if (url === settings.backgroundMusicUrl && shouldResume()) void play();
        }, ++recoveryAttempts * 1500);
    }

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
        youtubeReady = new Promise((resolve, reject) => {
            const timer = setTimeout(() => fail(), 12000);
            const fail = () => {
                clearTimeout(timer);
                document.querySelector('script[src*="youtube.com/iframe_api"]')?.remove();
                reject(new Error("YouTube indisponible"));
            };
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                clearTimeout(timer);
                if (typeof prev === "function") prev();
                resolve();
            };
            if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
            const script = document.createElement("script");
            script.src = "https://www.youtube.com/iframe_api";
            script.async = true;
            script.onerror = fail;
            document.head.appendChild(script);
        }).catch((error) => {
            youtubeReady = null;
            throw error;
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
        if (el.getAttribute("src") !== settings.backgroundMusicUrl || el.error) {
            el.src = settings.backgroundMusicUrl;
            el.loop = true;
            el.load();
        }
        return el;
    }

    function setupYouTubePlayer(videoId) {
        if (youtubePlayerReady && youtubePlayer && youtubeVideoId === videoId) return Promise.resolve();
        if (youtubeSetupPromise && youtubeSetupId === videoId) return youtubeSetupPromise;
        const request = ++youtubeRequest;
        youtubeSetupId = videoId;
        youtubeSetupPromise = createYouTubePlayer(videoId, request).finally(() => {
            if (youtubeRequest === request) {
                youtubeSetupPromise = null;
                youtubeSetupId = null;
            }
        });
        return youtubeSetupPromise;
    }

    async function createYouTubePlayer(videoId, request) {
        await loadYouTubeApi();
        if (request !== youtubeRequest || !settings.backgroundMusicEnabled || parseYouTubeId(settings.backgroundMusicUrl) !== videoId) return;
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
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (request === youtubeRequest && youtubeVideoId === videoId) destroyYouTubePlayer();
                reject(new Error("Le lecteur YouTube ne répond pas"));
            }, 12000);
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
                        clearTimeout(timer);
                        if (request !== youtubeRequest || !settings.backgroundMusicEnabled || parseYouTubeId(settings.backgroundMusicUrl) !== videoId) {
                            event.target.destroy();
                            resolve();
                            return;
                        }
                        youtubePlayerReady = true;
                        event.target.setVolume(Math.round(settings.backgroundMusicVolume * 100));
                        if (settings.backgroundMusicEnabled && wantAutoplay && !userPaused) {
                            try { event.target.playVideo(); } catch (e) {}
                        }
                        resolve();
                    },
                    onStateChange: () => {
                        if (request !== youtubeRequest) return;
                        if (isYouTubePlaying()) { playbackError = false; autoplayBlocked = false; }
                        updateToggleUi();
                    },
                    onAutoplayBlocked: () => {
                        if (request !== youtubeRequest) return;
                        autoplayBlocked = true;
                        updateToggleUi();
                        ensureInteractionRetry();
                    },
                    onError: () => {
                        clearTimeout(timer);
                        if (request !== youtubeRequest) { resolve(); return; }
                        playbackError = true;
                        updateToggleUi();
                        resolve();
                    }
                }
            });
        });
    }

    function isPlaying() {
        if (playbackMode === "youtube") return isYouTubePlaying();
        if (playbackMode === "audio") {
            const el = getAudio();
            return !!(el && !el.paused && !el.ended && !el.error && el.readyState >= 2);
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
        // La capture conserve le geste même si un bouton arrête sa propagation.
        // play() est appelé dans le geste, avant toute attente asynchrone.
        for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
            document.addEventListener(type, retry, { capture: true, passive: true });
        }
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
        const previousUrl = settings.backgroundMusicUrl;
        settings = {
            backgroundMusicUrl: (state.backgroundMusicUrl || "").trim(),
            backgroundMusicVolume: clampVolume(state.backgroundMusicVolume ?? 0.35),
            backgroundMusicEnabled: state.backgroundMusicEnabled !== false && state.sections?.music !== false
        };
        restorePausedPreference();
        if (previousUrl !== settings.backgroundMusicUrl) {
            cancelRecovery();
            recoveryAttempts = 0;
            playbackError = false;
            autoplayBlocked = false;
        }

        const btn = document.getElementById("music-toggle-btn");
        const hasTrack = Boolean(settings.backgroundMusicUrl);
        const ytId = parseYouTubeId(settings.backgroundMusicUrl);

        if (!hasTrack || !settings.backgroundMusicEnabled) {
            cancelRecovery();
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
            const requestedUrl = settings.backgroundMusicUrl;
            const pending = setupYouTubePlayer(ytId);
            const request = youtubeRequest;
            void pending.catch(() => {
                if (request !== youtubeRequest || requestedUrl !== settings.backgroundMusicUrl || !settings.backgroundMusicEnabled) return;
                playbackError = true;
                updateToggleUi();
            });
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
        const available = Boolean(settings.backgroundMusicEnabled && settings.backgroundMusicUrl);
        if (available) btn.classList.remove("hidden");
        else btn.classList.add("hidden");
        btn.setAttribute("aria-hidden", available ? "false" : "true");
        const playing = isPlaying();
        const state = !available ? "disabled" : userPaused ? "paused" : playing ? "playing"
            : playbackError ? "error" : autoplayBlocked ? "blocked" : "ready";
        btn.setAttribute("data-music-state", state);
        btn.setAttribute("aria-pressed", playing ? "true" : "false");
        const label = playing ? "Couper la musique" : playbackError ? "Réessayer la musique" : "Lancer la musique";
        btn.setAttribute("title", label);
        btn.setAttribute("aria-label", label);
        const icon = btn.querySelector(".music-toggle-icon");
        if (icon) icon.textContent = playing ? "♫" : "♪";
    }

    async function play() {
        if (!settings.backgroundMusicUrl || !settings.backgroundMusicEnabled) return false;
        if (userPaused) return false;
        if (isPlaying()) return true;
        const requestedUrl = settings.backgroundMusicUrl;
        try {
            if (playbackMode === "youtube") {
                const ytId = parseYouTubeId(settings.backgroundMusicUrl);
                if (!ytId) return false;
                if (playbackError) {
                    playbackError = false;
                    destroyYouTubePlayer();
                }
                // Préserver le geste utilisateur lorsque le lecteur est déjà prêt.
                if (!youtubePlayerReady || youtubeVideoId !== ytId) await setupYouTubePlayer(ytId);
                if (!settings.backgroundMusicEnabled || userPaused || parseYouTubeId(settings.backgroundMusicUrl) !== ytId || !youtubePlayer) return false;
                youtubePlayer.setVolume(Math.round(settings.backgroundMusicVolume * 100));
                youtubePlayer.playVideo();
            } else if (playbackMode === "audio") {
                const el = prepareAudioElement();
                if (!el) return false;
                await el.play();
                if (requestedUrl !== settings.backgroundMusicUrl) return false;
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
                if (requestedUrl !== settings.backgroundMusicUrl) return false;
                if (!settings.backgroundMusicEnabled || userPaused) {
                    el.pause();
                    return false;
                }
            }
            playbackError = false;
            autoplayBlocked = false;
            updateToggleUi();
            return isPlaying();
        } catch (error) {
            if (requestedUrl !== settings.backgroundMusicUrl) return false;
            if (error.name === "NotAllowedError") autoplayBlocked = true;
            else if (error.name !== "AbortError") {
                playbackError = true;
                if (playbackMode === "audio") scheduleRecovery();
            }
            updateToggleUi();
            if (!userPaused) ensureInteractionRetry();
            return false;
        }
    }

    function pause() {
        cancelRecovery();
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
            return !!(el && !el.paused && !el.error);
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
        savePausedPreference();
    }

    function readPausedPreference() {
        const eventId = window.EventConfig && EventConfig.getEventId
            ? EventConfig.getEventId()
            : "default";
        try { return sessionStorage.getItem(`wedding_event_${eventId}_music_paused`) === "1"; }
        catch { return userPaused; }
    }

    function restorePausedPreference() {
        const eventId = window.EventConfig?.getEventId?.() || "default";
        if (preferenceKey === eventId) return;
        preferenceKey = eventId;
        userPaused = readPausedPreference();
    }

    function savePausedPreference() {
        const eventId = window.EventConfig && EventConfig.getEventId
            ? EventConfig.getEventId()
            : "default";
        try { sessionStorage.setItem(`wedding_event_${eventId}_music_paused`, userPaused ? "1" : "0"); } catch {}
    }

    function armAutoplay() {
        if (!settings.backgroundMusicEnabled) return;
        restorePausedPreference();
        if (userPaused) return;
        wantAutoplay = true;
        ensureInteractionRetry();
        if (!isPlaying()) void tryAutoplay();
    }

    function onGuestEnter() {
        if (!settings.backgroundMusicEnabled) return;
        restorePausedPreference();
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
            });
        }
        const el = getAudio();
        if (el) {
            el.addEventListener("play", updateToggleUi);
            el.addEventListener("pause", updateToggleUi);
            el.addEventListener("ended", updateToggleUi);
            el.addEventListener("playing", () => {
                if (!settings.backgroundMusicEnabled || userPaused) { el.pause(); return; }
                cancelRecovery();
                recoveryAttempts = 0;
                playbackError = false;
                autoplayBlocked = false;
                updateToggleUi();
            });
            el.addEventListener("error", () => {
                if (playbackMode !== "audio" || !el.getAttribute("src")) return;
                playbackError = true;
                scheduleRecovery();
            });
            el.addEventListener("loadeddata", updateToggleUi);
            el.addEventListener("waiting", updateToggleUi);
        }
        const resume = () => {
            if (document.visibilityState === "hidden" || !shouldResume()) return;
            if (!isPlaying()) void play();
        };
        window.addEventListener?.("online", resume);
        window.addEventListener?.("pageshow", resume);
        document.addEventListener("visibilitychange", resume);
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
        refreshUi: updateToggleUi,
        getSettings: () => ({ ...settings })
    };
})();

window.BackgroundMusic = BackgroundMusic;
