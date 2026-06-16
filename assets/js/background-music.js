/**
 * Musique de fond — MP3 direct ou YouTube (iframe API)
 */
const BackgroundMusic = (() => {
    let audio = null;
    let youtubePlayer = null;
    let youtubeReady = null;
    let youtubeVideoId = null;
    let playbackMode = "none";
    let settings = {
        backgroundMusicUrl: "",
        backgroundMusicVolume: 0.35,
        backgroundMusicEnabled: true
    };
    let userPaused = false;
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
    }

    function stopAudioElement() {
        const el = getAudio();
        if (!el) return;
        el.pause();
        el.removeAttribute("src");
        el.load();
    }

    async function setupYouTubePlayer(videoId) {
        await loadYouTubeApi();
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
                        event.target.setVolume(Math.round(settings.backgroundMusicVolume * 100));
                        resolve();
                    },
                    onStateChange: updateToggleUi
                }
            });
        });
    }

    function isYouTubePlaying() {
        if (!youtubePlayer || typeof youtubePlayer.getPlayerState !== "function") return false;
        return youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
    }

    function apply(state) {
        if (!state) return;
        settings = {
            backgroundMusicUrl: state.backgroundMusicUrl || "",
            backgroundMusicVolume: clampVolume(state.backgroundMusicVolume ?? 0.35),
            backgroundMusicEnabled: state.backgroundMusicEnabled !== false
        };

        const btn = document.getElementById("music-toggle-btn");
        const hasTrack = Boolean(settings.backgroundMusicUrl);
        const ytId = parseYouTubeId(settings.backgroundMusicUrl);

        if (!hasTrack || !settings.backgroundMusicEnabled) {
            stopAudioElement();
            destroyYouTubePlayer();
            playbackMode = "none";
            if (btn) btn.classList.add("hidden");
            return;
        }

        if (btn) btn.classList.remove("hidden");

        if (ytId) {
            stopAudioElement();
            playbackMode = "youtube";
            setupYouTubePlayer(ytId).then(updateToggleUi).catch(updateToggleUi);
        } else {
            destroyYouTubePlayer();
            playbackMode = "audio";
            const el = getAudio();
            if (el) {
                el.volume = settings.backgroundMusicVolume;
                if (el.src !== settings.backgroundMusicUrl) {
                    el.src = settings.backgroundMusicUrl;
                    el.loop = true;
                    el.load();
                }
            }
        }
        updateToggleUi();
    }

    function updateToggleUi() {
        const btn = document.getElementById("music-toggle-btn");
        if (!btn) return;
        let playing = false;
        if (playbackMode === "youtube") {
            playing = isYouTubePlaying();
        } else if (playbackMode === "audio") {
            const el = getAudio();
            playing = !!(el && !el.paused && !el.ended && el.currentTime > 0);
        }
        btn.setAttribute("aria-pressed", playing ? "true" : "false");
        btn.setAttribute("title", playing ? "Couper la musique" : "Lancer la musique");
        const icon = btn.querySelector(".music-toggle-icon");
        if (icon) icon.textContent = playing ? "♫" : "♪";
    }

    async function play() {
        if (!settings.backgroundMusicUrl || !settings.backgroundMusicEnabled) return false;
        if (userPaused) return false;
        try {
            if (playbackMode === "youtube") {
                const ytId = parseYouTubeId(settings.backgroundMusicUrl);
                if (!ytId) return false;
                await setupYouTubePlayer(ytId);
                youtubePlayer.setVolume(Math.round(settings.backgroundMusicVolume * 100));
                youtubePlayer.playVideo();
            } else if (playbackMode === "audio") {
                const el = getAudio();
                if (!el) return false;
                el.volume = settings.backgroundMusicVolume;
                await el.play();
            } else {
                return false;
            }
            updateToggleUi();
            return true;
        } catch {
            updateToggleUi();
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
        if (!settings.backgroundMusicUrl) return;
        const playing = playbackMode === "youtube" ? isYouTubePlaying() : (() => {
            const el = getAudio();
            return !!(el && !el.paused);
        })();
        if (playing) {
            userPaused = true;
            pause();
        } else {
            userPaused = false;
            play();
        }
    }

    function onGuestEnter() {
        if (!settings.backgroundMusicUrl || !settings.backgroundMusicEnabled) return;
        const saved = localStorage.getItem("wedding_music_paused");
        userPaused = saved === "1";
        if (!userPaused) play();
    }

    function wireControls() {
        if (wired) return;
        wired = true;
        const btn = document.getElementById("music-toggle-btn");
        if (btn) {
            btn.addEventListener("click", () => {
                toggle();
                localStorage.setItem("wedding_music_paused", userPaused ? "1" : "0");
            });
        }
        const el = getAudio();
        if (el) {
            el.addEventListener("play", updateToggleUi);
            el.addEventListener("pause", updateToggleUi);
            el.addEventListener("ended", updateToggleUi);
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
        onGuestEnter,
        init,
        parseYouTubeId,
        getSettings: () => ({ ...settings })
    };
})();

window.BackgroundMusic = BackgroundMusic;
