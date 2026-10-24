// Tema: "dark", "light" ya da "system" (işletim sisteminin tercihi). Sayfaların <head> bölümünde settings.js'ten sonra
// yüklenir: son bilinen tercih localStorage'dan hemen uygulanır (açık temada koyu yanıp sönme olmaz), sonra
// chrome.storage ile doğrulanır. Başka bir sayfada yapılan değişiklik ve sistem teması canlı izlenir.
var CaptureTheme = (() => {
    const CACHE_KEY = 'capturehub-theme';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const listeners = [];
    let preference = readCache() || CaptureSettings.DEFAULTS.theme;

    function readCache() {
        try {
            return localStorage.getItem(CACHE_KEY);
        } catch {
            return null;
        }
    }

    function isDark() {
        return preference === 'system' ? media.matches : preference !== 'light';
    }

    function paint() {
        document.documentElement.classList.toggle('dark', isDark());
        for (const listener of listeners) listener(preference, isDark());
    }

    function use(value) {
        preference = value || CaptureSettings.DEFAULTS.theme;
        try {
            localStorage.setItem(CACHE_KEY, preference);
        } catch {
            // Önbellek yalnız ilk boyamayı hızlandırır; yazılamazsa tema yine chrome.storage'dan gelir
        }
        paint();
    }

    async function set(value) {
        use(value);
        await chrome.storage.local.set({ theme: preference });
    }

    // Dinleyici hemen bir kez, sonra her değişiklikte çağrılır
    function onChange(listener) {
        listeners.push(listener);
        listener(preference, isDark());
    }

    paint();
    media.addEventListener('change', () => {
        if (preference === 'system') paint();
    });
    chrome.storage.local.get({ theme: CaptureSettings.DEFAULTS.theme }).then(({ theme }) => use(theme));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && 'theme' in changes) use(changes.theme.newValue);
    });

    return { isDark, set, onChange, get preference() { return preference; } };
})();
