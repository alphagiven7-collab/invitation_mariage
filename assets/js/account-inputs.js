(() => {
    const eye = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/></svg>';
    function init() {
        document.querySelectorAll('[data-password-toggle]').forEach((button) => {
            const input = document.getElementById(button.dataset.passwordToggle);
            if (!input) return;
            button.innerHTML = eye;
            button.addEventListener('click', () => {
                const visible = input.type === 'password';
                input.type = visible ? 'text' : 'password';
                button.setAttribute('aria-pressed', String(visible));
                button.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
            });
            input.form?.addEventListener('reset', () => {
                input.type = 'password';
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-label', 'Afficher le mot de passe');
            });
        });
        document.querySelectorAll('[data-organizer-phone]').forEach((input) => {
            const prefix = input.parentElement.querySelector('.phone-prefix');
            const updatePrefix = () => {
                if (prefix) prefix.hidden = input.dataset.emailMode === 'true' || /^(?:\+|00|243)/.test(input.value.trim());
            };
            input.addEventListener('input', updatePrefix);
            input.addEventListener('blur', () => {
                if (input.dataset.emailMode === 'true' || input.value.includes('@')) return;
                const normalized = window.OrganizerIdentity.normalizePhone(input.value);
                if (normalized) input.value = normalized.startsWith('+243') ? normalized.slice(4) : normalized;
                updatePrefix();
            });
            updatePrefix();
        });
        const mode = document.getElementById('login-admin-mode');
        if (mode) mode.addEventListener('click', () => {
            const input = document.getElementById('login-email');
            const admin = input.dataset.emailMode !== 'true';
            input.dataset.emailMode = String(admin);
            input.type = admin ? 'email' : 'tel';
            input.inputMode = admin ? 'email' : 'tel';
            input.placeholder = admin ? 'administrateur@exemple.com' : '812 345 678';
            input.value = '';
            input.parentElement.querySelector('.phone-prefix').hidden = admin;
            document.getElementById('login-identifier-label').textContent = admin ? 'Email administrateur' : 'Numéro de téléphone';
            document.getElementById('login-phone-help').hidden = admin;
            mode.textContent = admin ? 'Connexion organisateur' : 'Connexion administrateur par email';
            input.focus();
        });
    }
    window.addEventListener('DOMContentLoaded', init);
})();
