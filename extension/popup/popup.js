// Popup: yakalama modlarını başlatır, son yakalamaları listeler ve tema tercihini saklar.
const MODE_KEYS = { visible: 'modeVisible', full: 'modeFull', region: 'modeRegion', element: 'modeElement' };
const RECENT_LIMIT = 6;

const themeToggle = document.getElementById('themeToggle');

function setStatus(text) {
    document.getElementById('status').textContent = text;
}

// Düğme o an görünen temanın tersine geçer; "sistem" tercihi de bu tıklamayla açık ya da koyuya sabitlenir
themeToggle.addEventListener('click', () => CaptureTheme.set(CaptureTheme.isDark() ? 'light' : 'dark'));

document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
        setStatus('');
        const reply = await chrome.runtime.sendMessage({ action: 'capture', mode: button.dataset.mode })
            .catch((error) => ({ ok: false, error: error.message }));
        if (!reply || !reply.ok) return setStatus(CaptureI18n.t(reply ? reply.error : 'captureFailed'));
        // Bölge seçiminde popup kapanmalı ki kullanıcı sayfaya tıklayabilsin; düzenleyici sekmesi de bu noktada açılmış olur
        window.close();
    });
});

// Gecikme seçimi kalıcıdır; seçili düğme aria-pressed ile belirtilir
function renderDelay(delay) {
    document.querySelectorAll('[data-delay]').forEach((button) => {
        const on = Number(button.dataset.delay) === delay;
        button.setAttribute('aria-pressed', String(on));
        button.classList.toggle('chip-active', on);
        button.classList.toggle('chip', !on);
    });
}

document.querySelectorAll('[data-delay]').forEach((button) => {
    button.addEventListener('click', async () => {
        const delay = Number(button.dataset.delay);
        renderDelay(delay);
        await chrome.storage.local.set({ delay });
    });
});

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString(document.documentElement.lang || undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function renderRecent() {
    const rows = (await CaptureStore.list()).slice(0, RECENT_LIMIT);
    const items = rows.map((row) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        const time = document.createElement('span');
        time.textContent = formatTime(row.createdAt);
        const detail = document.createElement('span');
        detail.className = 'meta';
        const site = CaptureGeometry.siteName(row.url);
        detail.textContent = [CaptureI18n.t(MODE_KEYS[row.mode] || row.mode), site, CaptureGeometry.dimensions(row.width, row.height)].filter(Boolean).join(' · ');
        if (row.title) button.title = row.title;
        button.append(time, detail);
        button.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html?id=${row.id}`) });
            window.close();
        });
        item.appendChild(button);
        return item;
    });
    document.getElementById('recent').replaceChildren(...items);
    document.getElementById('empty').hidden = rows.length > 0;
}

(async () => {
    await CaptureI18n.load();
    CaptureI18n.apply();
    for (const button of document.querySelectorAll('[data-delay]:not([data-i18n])')) {
        button.textContent = CaptureI18n.t('delayFormat', { n: button.dataset.delay });
    }
    document.querySelector('[data-i18n="footerVersion"]').textContent = CaptureI18n.t('footerVersion', { version: chrome.runtime.getManifest().version });
    CaptureTheme.onChange((preference, dark) => {
        themeToggle.textContent = CaptureI18n.t(dark ? 'switchToLight' : 'switchToDark');
    });
    const { delay } = await chrome.storage.local.get({ delay: CaptureSettings.DEFAULTS.delay });
    renderDelay(delay);
    await renderRecent();
})();
