// Ayarlar sayfası: tercihleri kaydeder, yedekler ve sıfırlar; geçmişi listeler, arar ve siler; kısayolları gösterir.
// Her değişiklikte yalnız değişen anahtar yazılır.
const LANGUAGE_NAMES = {
    en: 'English', tr: 'Türkçe', de: 'Deutsch', es: 'Español', fr: 'Français', hi: 'हिन्दी', id: 'Bahasa Indonesia',
    ja: '日本語', pt_BR: 'Português (Brasil)', ru: 'Русский', ar: 'العربية', bn: 'বাংলা', ur: 'اردو', vi: 'Tiếng Việt', zh_CN: '简体中文'
};
const MODE_KEYS = { visible: 'modeVisible', full: 'modeFull', region: 'modeRegion', element: 'modeElement' };
// Komut adları arayüz dilinde gösterilir (Chrome'un açıklaması tarayıcı dilindedir); sıra da buradan gelir
const COMMAND_KEYS = { capture_visible: 'modeVisible', capture_full: 'modeFull', capture_region: 'modeRegion', capture_element: 'modeElement' };
// Boş bırakılan bağlantı gizlenir
const LINKS = {
    privacy: 'https://github.com/kilicberkay/CaptureHub/blob/main/PRIVACY.md',
    source: 'https://github.com/kilicberkay/CaptureHub'
};
const { DEFAULTS } = CaptureSettings;

const $ = (id) => document.getElementById(id);
let statusTimer = null;

function flashStatus(text = CaptureI18n.t('saved')) {
    $('status').textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => ($('status').textContent = ''), 2500);
}

async function save(key, value) {
    await chrome.storage.local.set({ [key]: value });
    flashStatus();
}

function fillSelects() {
    const language = $('uiLang');
    language.append(new Option(CaptureI18n.t('languageAuto'), 'auto'));
    for (const code of CaptureI18n.languages) language.append(new Option(LANGUAGE_NAMES[code] || code, code));

    const delay = $('delay');
    delay.replaceChildren(...CaptureSettings.DELAYS.map((n) => new Option(n === 0 ? CaptureI18n.t('delayNone') : CaptureI18n.t('delayFormat', { n }), String(n))));
}

// Kayıtlı değerleri denetim alanlarına yazar; tema CaptureTheme tarafından uygulanır
function showValues(values) {
    $('theme').value = values.theme;
    $('uiLang').value = values.uiLang;
    $('format').value = values.format;
    $('quality').value = Math.round(values.quality * 100);
    $('qualityValue').textContent = `${Math.round(values.quality * 100)}%`;
    $('nameTemplate').value = values.nameTemplate;
    $('delay').value = String(values.delay);
    $('historyLimit').value = String(values.historyLimit);
}

function bindControls() {
    $('theme').addEventListener('change', async (event) => {
        await CaptureTheme.set(event.target.value);
        flashStatus();
    });
    $('uiLang').addEventListener('change', async (event) => {
        await save('uiLang', event.target.value);
        location.reload();
    });
    $('format').addEventListener('change', (event) => save('format', event.target.value));
    $('quality').addEventListener('input', (event) => {
        $('qualityValue').textContent = `${event.target.value}%`;
    });
    $('quality').addEventListener('change', (event) => save('quality', Number(event.target.value) / 100));
    $('nameTemplate').addEventListener('change', (event) => save('nameTemplate', event.target.value.trim()));
    $('delay').addEventListener('change', (event) => save('delay', Number(event.target.value)));
    // Sınır düşürülünce fazla eski kayıtlar bir sonraki yakalamayı beklemeden silinir
    $('historyLimit').addEventListener('change', async (event) => {
        await save('historyLimit', Number(event.target.value));
        await CaptureStore.trim();
    });
}

function exportSettings(values) {
    const backup = CaptureSettings.createBackup(values);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    link.download = `capturehub-settings-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Dosya doğrulanmadan hiçbir ayar yazılmaz; geçersiz dosyada mevcut ayarlar olduğu gibi kalır
async function importSettings(file) {
    try {
        const values = CaptureSettings.parseBackup(await file.text());
        await chrome.storage.local.set(values);
        location.reload();
    } catch (error) {
        flashStatus(CaptureI18n.t(['backupTooLarge', 'backupInvalid'].includes(error.message) ? error.message : 'backupInvalid'));
    }
}

async function resetSettings() {
    if (!confirm(CaptureI18n.t('resetConfirm'))) return;
    await chrome.storage.local.remove(CaptureSettings.KEYS);
    location.reload();
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString(document.documentElement.lang || undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function chipButton(textKey, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = CaptureI18n.t(textKey);
    button.addEventListener('click', onClick);
    return button;
}

// İndirilen dosya hâlâ diskteyse klasörü onu seçili açar; silinmiş ya da taşınmışsa varsayılan indirme klasörü açılır
async function showInFolder(downloadId) {
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (item && item.exists && item.state === 'complete') return chrome.downloads.show(downloadId);
    chrome.downloads.showDefaultFolder();
    flashStatus(CaptureI18n.t('folderMissing'));
}

function historyRow(row) {
    const item = document.createElement('li');
    item.className = 'history-row';
    const info = document.createElement('span');
    info.className = 'history-info';
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = row.title || CaptureI18n.t(MODE_KEYS[row.mode] || 'captureTitle');
    const detail = document.createElement('span');
    detail.className = 'meta';
    detail.textContent = `${formatTime(row.createdAt)} · ${CaptureI18n.t(MODE_KEYS[row.mode] || 'captureTitle')} · ${CaptureGeometry.dimensions(row.width, row.height)}`;
    info.append(title, detail);
    // Yalnız http(s) adresleri bağlantı olur; javascript: gibi adresler hiç gösterilmez
    const site = CaptureGeometry.siteName(row.url);
    if (site) {
        const link = Object.assign(document.createElement('a'), { href: row.url, target: '_blank', rel: 'noopener noreferrer', textContent: site, title: row.url });
        link.className = 'history-site';
        info.append(link);
    }

    const actions = document.createElement('span');
    actions.className = 'buttons';
    actions.append(chipButton('historyOpen', () => chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html?id=${row.id}`) })));
    if (Number.isInteger(row.downloadId)) actions.append(chipButton('historyFolder', () => showInFolder(row.downloadId)));
    actions.append(chipButton('historyDelete', async () => {
        await CaptureStore.remove(row.id);
        renderHistory();
    }));
    item.append(info, actions);
    return item;
}

function matches(row, query) {
    if (!query) return true;
    const mode = CaptureI18n.t(MODE_KEYS[row.mode] || 'captureTitle');
    return [row.title, row.url, mode].some((text) => (text || '').toLowerCase().includes(query));
}

async function renderHistory() {
    const rows = await CaptureStore.list();
    const query = $('historySearch').value.trim().toLowerCase();
    const shown = rows.filter((row) => matches(row, query));
    $('historyList').replaceChildren(...shown.map(historyRow));
    $('historyEmpty').textContent = CaptureI18n.t(rows.length === 0 ? 'historyEmpty' : 'historyNoMatch');
    $('historyEmpty').hidden = shown.length > 0;
    $('historySearch').hidden = rows.length === 0;
    $('historyClear').hidden = rows.length === 0;
}

// Chrome'daki güncel atamalar; kullanıcı kısayolu kaldırdıysa "atanmamış" yazılır
async function renderShortcuts() {
    const commands = (await chrome.commands.getAll()).filter((command) => COMMAND_KEYS[command.name]);
    const order = Object.keys(COMMAND_KEYS);
    commands.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    const rows = commands.flatMap((command) => {
        const term = document.createElement('dt');
        term.textContent = CaptureI18n.t(COMMAND_KEYS[command.name]);
        const value = document.createElement('dd');
        if (command.shortcut) {
            const key = document.createElement('kbd');
            key.textContent = command.shortcut;
            value.append(key);
        } else {
            value.className = 'meta';
            value.textContent = CaptureI18n.t('shortcutNone');
        }
        return [term, value];
    });
    $('shortcutList').replaceChildren(...rows);
}

function showSection() {
    const name = location.hash.slice(1) || 'general';
    const target = document.querySelector(`section#${CSS.escape(name)}`) || $('general');
    for (const section of document.querySelectorAll('section.panel')) section.hidden = section !== target;
    for (const link of document.querySelectorAll('.nav-link')) {
        const active = link.dataset.section === target.id;
        link.classList.toggle('active', active);
        link.setAttribute('aria-current', active ? 'page' : 'false');
    }
    if (target.id === 'history') renderHistory();
    if (target.id === 'shortcuts') renderShortcuts();
}

(async () => {
    await CaptureI18n.load();
    CaptureI18n.apply();
    document.title = `CaptureHub | ${CaptureI18n.t('settingsTitle')}`;
    fillSelects();
    const values = await chrome.storage.local.get(DEFAULTS);
    showValues(values);
    bindControls();

    $('backupExport').addEventListener('click', async () => exportSettings(await chrome.storage.local.get(DEFAULTS)));
    $('backupImport').addEventListener('click', () => $('backupFile').click());
    $('backupFile').addEventListener('change', (event) => {
        const [file] = event.target.files;
        event.target.value = '';
        if (file) importSettings(file);
    });
    $('reset').addEventListener('click', resetSettings);

    $('historySearch').placeholder = CaptureI18n.t('historySearch');
    $('historySearch').addEventListener('input', renderHistory);
    $('historyClear').addEventListener('click', async () => {
        if (!confirm(CaptureI18n.t('historyClearConfirm'))) return;
        await CaptureStore.clear();
        renderHistory();
    });
    $('openShortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

    $('aboutVersion').textContent = CaptureI18n.t('aboutVersion', { version: chrome.runtime.getManifest().version });
    const links = [];
    if (LINKS.privacy) links.push(Object.assign(document.createElement('a'), { href: LINKS.privacy, target: '_blank', rel: 'noopener', textContent: CaptureI18n.t('aboutPrivacy') }));
    if (LINKS.source) links.push(Object.assign(document.createElement('a'), { href: LINKS.source, target: '_blank', rel: 'noopener', textContent: CaptureI18n.t('aboutSource') }));
    $('aboutLinks').replaceChildren(...links);
    $('aboutLinks').hidden = links.length === 0;

    // Tema başka bir sayfadan (popup) değişirse seçim kutusu da güncellenir
    CaptureTheme.onChange((preference) => {
        $('theme').value = preference;
    });
    window.addEventListener('hashchange', showSection);
    showSection();
})();
