/**
 * Musique de fond — lecture après entrée invité (politique autoplay navigateur)
 */
const BackgroundMusic = (() => {
    let audio = null;
    let settings = {
        backgroundMusicUrl: "",
        backgroundMusicVolume: 0.35,
        backgroundMusicEnabled: true
    };
    let userPaused = false;
    let wired = false;

    function getAudio() {
        if (!audio) {
            audio = document.getElementById("background-music");
        }
        return audio;
    }

    function clampVolume(v) {
        const n = Number(v);
        if (Number.isNaN(n)) return 0.35;
        return Math.min(1, Math.max(0, n));
    }

    function apply(state) {
        if (!state) return;
        settings = {
            backgroundMusicUrl: state.backgroundMusicUrl || "",
            backgroundMusicVolume: clampVolume(state.backgroundMusicVolume ?? 0.35),
            backgroundMusicEnabled: state.backgroundMusicEnabled !== false
        };

        const el = getAudio();
        const btn = document.getElementById("music-toggle-btn");
        const hasTrack = Boolean(settings.backgroundMusicUrl);

        if (!el || !hasTrack || !settings.backgroundMusicEnabled) {
            if (el) {
                el.pause();
                el.removeAttribute("src");
            }
            if (btn) btn.classList.add("hidden");
            return;
        }

        el.volume = settings.backgroundMusicVolume;
        if (el.src !== settings.backgroundMusicUrl) {
            el.src = settings.backgroundMusicUrl;
            el.load();
        }

        if (btn) {
            btn.classList.remove("hidden");
            updateToggleUi();
        }
    }

    function updateToggleUi() {
        const btn = document.getElementById("music-toggle-btn");
        const el = getAudio();
        if (!btn || !el) return;
        const playing = !el.paused && !el.ended && el.currentTime > 0;
        btn.setAttribute("aria-pressed", playing ? "true" : "false");
        btn.setAttribute("title", playing ? "Couper la musique" : "Lancer la musique");
        const icon = btn.querySelector(".music-toggle-icon");
        if (icon) icon.textContent = playing ? "♫" : "♪";
    }

    async function play() {
        const el = getAudio();
        if (!el || !settings.backgroundMusicUrl || !settings.backgroundMusicEnabled) return false;
        if (userPaused) return false;
        try {
            el.volume = settings.backgroundMusicVolume;
            await el.play();
            updateToggleUi();
            return true;
        } catch {
            updateToggleUi();
            return false;
        }
    }

    function pause() {
        const el = getAudio();
        if (!el) return;
        el.pause();
        updateToggleUi();
    }

    function toggle() {
        const el = getAudio();
        if (!el || !settings.backgroundMusicUrl) return;
        if (el.paused) {
            userPaused = false;
            play();
        } else {
            userPaused = true;
            pause();
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
        getSettings: () => ({ ...settings })
    };
})();

window.BackgroundMusic = BackgroundMusic;
