// CaptureHub servis çalışanı: görünür alan, tam sayfa, bölge ve öğe yakalama. Sonucu depoya yazar ve düzenleyiciyi açar.
importScripts('../shared/settings.js', 'geometry.js', 'db.js');

// captureVisibleTab saniyede en fazla iki çağrıya izin verir; tam sayfada çağrılar arasında bu kadar beklenir
const CAPTURE_INTERVAL_MS = 550;
// Kaydırma sonrası sayfanın yeniden çizilmesi için bekleme
const RENDER_WAIT_MS = 250;
// Tembel görseller için ön kaydırmada her konumda bekleme ve görsellerin yüklenmesi için en uzun bekleme
const PRELOAD_STEP_MS = 120;
const PRELOAD_TIMEOUT_MS = 1500;
// Hata nedeni simgenin ipucunda bu kadar kalır
const ERROR_TITLE_MS = 8000;
// ponytail: tuval yüksekliği CaptureGeometry.maxCanvasHeight ile sınırlı (dar sayfada 32000 px). Sınır: aşan kısım
// yakalanmaz, kayıt truncated olarak işaretlenir ve düzenleyici uyarı gösterir. Yükseltme: parçalı (çok görüntülü) kayıt.
const BADGE_COLOR = '#c2185b';
const RESTRICTED_URL = /^(chrome|chrome-extension|edge|about|devtools|view-source):/;

let lastCaptureAt = 0;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function setBadge(text) {
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    chrome.action.setBadgeText({ text });
}

async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url || RESTRICTED_URL.test(tab.url)) throw new Error('errRestricted');
    return tab;
}

// Görünen alanı PNG olarak döndürür. Çağrılar arasındaki kota beklemesi burada yapılır.
async function captureVisible(windowId) {
    const wait = lastCaptureAt + CAPTURE_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCaptureAt = Date.now();
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    return (await fetch(dataUrl)).blob();
}

// Aşağıdaki işlevler sayfada çalışır; kendi kapsamları dışına (servis çalışanı) bağlı değildir.
// CaptureGeometry yalnızca geometry.js enjekte edildikten sonra kullanılabilir.

// Kaydırılacak ölçüleri belirler. Pencere kaydırılamıyorsa ve ekranın büyük kısmını kaplayan tek bir
// kaydırılabilir kapsayıcı varsa onu kullanır.
function measurePage() {
    const windowHeight = window.innerHeight;
    let container = null;
    if (document.documentElement.scrollHeight <= windowHeight + 1) {
        let bestArea = 0;
        for (const el of document.querySelectorAll('body *')) {
            if (el.clientHeight < 1 || el.scrollHeight <= el.clientHeight + 1) continue;
            if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width * rect.height > bestArea) {
                bestArea = rect.width * rect.height;
                container = el;
            }
        }
    }
    if (container && container.getBoundingClientRect().height < windowHeight * 0.6) container = null;

    if (container) {
        // ponytail: kapsayıcı görünüme sığdırılır. Sınır: görünümden yüksek kapsayıcı yalnızca görünen kısmıyla yakalanır.
        // Yükseltme: kapsayıcıyı parça parça kaydırıp birleştirme eklenince.
        container.scrollIntoView({ block: 'nearest' });
        container.setAttribute('data-capturehub-scroll', '');
        const box = container.getBoundingClientRect();
        const clip = CaptureGeometry.clampRect({
            x: box.left + container.clientLeft, y: box.top + container.clientTop,
            width: container.clientWidth, height: container.clientHeight
        }, window.innerWidth, windowHeight);
        return {
            scrollY: container.scrollTop, viewportHeight: clip.height, pageHeight: container.scrollHeight,
            clip, viewportWidth: window.innerWidth, inContainer: true
        };
    }
    // Kırpma genişliği clientWidth: sayfanın dikey kaydırma çubuğu her dilimde tekrar edip görüntüye girmesin
    return {
        scrollY: window.scrollY, viewportHeight: windowHeight,
        pageHeight: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
        clip: { x: 0, y: 0, width: document.documentElement.clientWidth, height: windowHeight }, viewportWidth: window.innerWidth
    };
}

// Sabit ve yapışkan öğeleri dilime göre gizler: üst başlık yalnız ilk dilimde, alt bar yalnız son dilimde görünür
function applyFixedVisibility(index, count) {
    for (const item of window.__capturehubFixed || []) item.el.style.visibility = item.visibility;
    if (count <= 1) return;
    window.__capturehubFixed = [];
    for (const el of document.querySelectorAll('body *')) {
        const position = getComputedStyle(el).position;
        if (position !== 'fixed' && position !== 'sticky') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (CaptureGeometry.fixedShown(index, count, rect.top + rect.height / 2, window.innerHeight)) continue;
        window.__capturehubFixed.push({ el, visibility: el.style.visibility });
        el.style.visibility = 'hidden';
    }
}

// Kaydırma animasyonlu olmasın diye anlık yapılır; gerçek konum okunup döndürülür
function scrollPageTo(y) {
    const container = document.querySelector('[data-capturehub-scroll]');
    if (container) {
        container.scrollTop = y;
        return container.scrollTop;
    }
    window.scrollTo({ top: y, behavior: 'instant' });
    return window.scrollY;
}

// Kullanıcının kaldığı konuma döner ve geçici işaretleri temizler
function restorePage(scrollY) {
    for (const item of window.__capturehubFixed || []) item.el.style.visibility = item.visibility;
    window.__capturehubFixed = [];
    const container = document.querySelector('[data-capturehub-scroll]');
    if (container) {
        container.scrollTop = scrollY;
        container.removeAttribute('data-capturehub-scroll');
    } else {
        window.scrollTo({ top: scrollY, behavior: 'instant' });
    }
}

// Sayfada çalışır: tamamlanmamış görsellerin yüklenmesini (ya da hata vermesini) en fazla timeout kadar bekler
function waitForImages(timeout) {
    const pending = Array.from(document.images).filter((img) => !img.complete);
    const loaded = pending.map((img) => new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
    }));
    return Promise.race([Promise.all(loaded), new Promise((resolve) => setTimeout(resolve, timeout))]).then(() => pending.length);
}

// Tembel (loading="lazy") görseller görünüme girmeden yüklenmez: dilimlerden önce sayfa hızla kaydırılır
async function preloadImages(target, offsets) {
    for (const y of offsets) {
        await chrome.scripting.executeScript({ target, func: scrollPageTo, args: [y] });
        await sleep(PRELOAD_STEP_MS);
    }
    await chrome.scripting.executeScript({ target, func: waitForImages, args: [PRELOAD_TIMEOUT_MS] });
}

// Tüm sayfayı ya da (range verilirse) sayfa koordinatında { top, height } aralığını kaydırarak yakalar.
// Görünümden uzun öğe ve bölge bu yolla tamamıyla alınır.
async function captureFullPage(tab, range = null) {
    const target = { tabId: tab.id };
    await chrome.scripting.executeScript({ target, files: ['scripts/geometry.js'] });
    const [{ result: page }] = await chrome.scripting.executeScript({ target, func: measurePage });
    const top = range ? range.top : 0;
    const height = range ? range.height : page.pageHeight;
    const offsets = range
        ? CaptureGeometry.planRange(top, height, page.viewportHeight, page.pageHeight)
        : CaptureGeometry.planSlices(page.pageHeight, page.viewportHeight);
    const slices = [];
    try {
        if (offsets.length > 1) await preloadImages(target, offsets);
        for (let i = 0; i < offsets.length; i++) {
            await chrome.scripting.executeScript({ target, func: applyFixedVisibility, args: [i, offsets.length] });
            const [{ result: actualY }] = await chrome.scripting.executeScript({ target, func: scrollPageTo, args: [offsets[i]] });
            await sleep(RENDER_WAIT_MS);
            slices.push({ y: actualY, blob: await captureVisible(tab.windowId) });
            setBadge(`${i + 1}/${offsets.length}`);
        }
    } finally {
        await chrome.scripting.executeScript({ target, func: restorePage, args: [page.scrollY] });
        setBadge('');
    }
    return stitch(slices, page, top, Math.min(height, page.pageHeight - top));
}

// Dilimleri, her birinin kaydırma konumuna göre tek bir tuvalde birleştirir; tuval aralığın başından başlar
async function stitch(slices, page, top, height) {
    const first = await createImageBitmap(slices[0].blob);
    const scale = first.width / page.viewportWidth;
    first.close();
    const crop = CaptureGeometry.scaleRect(page.clip, scale);
    const fullHeight = Math.round(height * scale);
    const maxHeight = CaptureGeometry.maxCanvasHeight(crop.width);
    const canvas = new OffscreenCanvas(crop.width, Math.min(fullHeight, maxHeight));
    const ctx = canvas.getContext('2d');
    for (const slice of slices) {
        const bitmap = await createImageBitmap(slice.blob);
        ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, Math.round((slice.y - top) * scale), crop.width, crop.height);
        bitmap.close();
    }
    return { canvas, scale, inContainer: Boolean(page.inContainer), truncated: fullHeight > maxHeight };
}

async function canvasBlob(canvas) {
    return canvas.convertToBlob({ type: 'image/png' });
}

function setSelectMode(mode) {
    window.__capturehubMode = mode;
}

// Seçim katmanını sayfaya enjekte eder; kullanıcı alan veya öğe seçince select.js "region-selected" mesajı gönderir
async function startSelection(tab, mode) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: setSelectMode, args: [mode] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/geometry.js', 'scripts/select.js'] });
}

// Kaynak görüntüden CSS pikselindeki dikdörtgeni kırpar (görüntü cihaz pikseli olduğu için ölçek uygulanır)
async function cropTo(source, rect, scale) {
    const crop = CaptureGeometry.clampRect(CaptureGeometry.scaleRect(rect, scale), source.width, source.height);
    const canvas = new OffscreenCanvas(Math.max(1, crop.width), Math.max(1, crop.height));
    canvas.getContext('2d').drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return canvas.convertToBlob({ type: 'image/png' });
}

// Seçim sayfa koordinatındadır (rect) ve seçim anındaki kaydırma (scroll) ile gelir. Görünüme sığıyorsa görünen alandan
// kırpılır; sığmıyorsa (uzun öğe, kenarda kaydırılarak büyütülen bölge) o aralık kaydırılıp birleştirilerek alınır.
// ponytail: yakalama, seçimin yapıldığı sekmenin aktif olduğu varsayımıyla alınır. Sınır: seçim sırasında sekme
// değiştirilirse başka sekmenin görüntüsü kırpılır. Kaydırılabilir kapsayıcı içindeki uzun öğe görünen kısmıyla alınır.
// Yükseltme: sekme kimliğiyle yakalama (debugger API) ve kapsayıcı içinde aralık yakalama gerekirse.
async function finishRegion(sender, { mode, rect, scroll, viewport }) {
    const inView = { x: rect.x - scroll.x, y: rect.y - scroll.y, width: rect.width, height: rect.height };
    const fits = inView.y >= 0 && inView.y + inView.height <= viewport.height + 1;
    let blob;
    let truncated = false;
    if (fits) {
        const bitmap = await createImageBitmap(await captureVisible(sender.tab.windowId));
        blob = await cropTo(bitmap, inView, bitmap.width / viewport.width);
        bitmap.close();
    } else {
        const strip = await captureFullPage(sender.tab, { top: rect.y, height: rect.height });
        // Kapsayıcı içindeki sayfalarda aralık yakalanamaz; görünen kısım kırpılır
        if (strip.inContainer) {
            const bitmap = await createImageBitmap(await captureVisible(sender.tab.windowId));
            blob = await cropTo(bitmap, inView, bitmap.width / viewport.width);
            bitmap.close();
        } else {
            blob = await cropTo(strip.canvas, { x: inView.x, y: 0, width: rect.width, height: strip.canvas.height / strip.scale }, strip.scale);
            truncated = strip.truncated;
        }
    }
    const id = await openEditor(blob, mode, truncated, sender.tab);
    return { status: 'opened', id };
}

// Kaynak sayfanın adresi ve başlığı yalnız yerel geçmişte, yakalamaları ayırt etmek için saklanır
async function openEditor(blob, mode, truncated, tab) {
    const bitmap = await createImageBitmap(blob);
    const meta = { mode, width: bitmap.width, height: bitmap.height, truncated, url: tab.url || '', title: tab.title || '' };
    bitmap.close();
    const id = await CaptureStore.save(blob, meta);
    await chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html?id=${id}`) });
    return id;
}

// Gecikme sırasında rozette geri sayım gösterilir; sekme değişirse yakalama yapılmaz
async function countdown(seconds) {
    for (let left = seconds; left > 0; left--) {
        setBadge(String(left));
        await sleep(1000);
    }
    setBadge('');
}

async function runCapture(mode) {
    const tab = await activeTab();
    if (mode === 'region' || mode === 'element') {
        await startSelection(tab, mode);
        return { status: 'selecting' };
    }
    const { delay } = await chrome.storage.local.get({ delay: CaptureSettings.DEFAULTS.delay });
    if (delay > 0) await countdown(delay);
    if ((await activeTab()).id !== tab.id) throw new Error('errTabChanged');
    if (mode === 'full') {
        const result = await captureFullPage(tab);
        return { status: 'opened', id: await openEditor(await canvasBlob(result.canvas), mode, result.truncated, tab) };
    }
    return { status: 'opened', id: await openEditor(await captureVisible(tab.windowId), mode, false, tab) };
}

// Kısayol ve sağ tık menüsünden başlayan yakalamada popup yoktur: neden rozetle birlikte simgenin ipucuna yazılır
let errorTitleTimer = null;
function reportFailure(error) {
    console.error('CaptureHub:', error);
    const reason = chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('captureFailed');
    setBadge('!');
    chrome.action.setTitle({ title: `CaptureHub: ${reason}` });
    clearTimeout(errorTitleTimer);
    errorTitleTimer = setTimeout(() => {
        setBadge('');
        chrome.action.setTitle({ title: chrome.i18n.getMessage('actionTitle') });
    }, ERROR_TITLE_MS);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    let work = null;
    if (message.action === 'capture') work = runCapture(message.mode);
    if (message.action === 'region-selected') work = finishRegion(sender, message);
    if (!work) return false;
    work.then((result) => sendResponse({ ok: true, ...result }), (error) => sendResponse({ ok: false, error: error.message }));
    return true;
});

const COMMAND_MODES = { capture_visible: 'visible', capture_full: 'full', capture_region: 'region', capture_element: 'element' };

chrome.commands.onCommand.addListener((command) => {
    if (COMMAND_MODES[command]) runCapture(COMMAND_MODES[command]).catch(reportFailure);
});

// Araç çubuğu simgesinin sağ tık menüsü. Chrome bu menüde en fazla altı üst düzey öğe gösterir.
const MENU_ITEMS = [
    ['visible', 'cmdVisible'], ['full', 'cmdFull'], ['region', 'cmdRegion'], ['element', 'cmdElement'],
    ['history', 'menuHistory'], ['settings', 'menuSettings']
];

chrome.runtime.onInstalled.addListener(async () => {
    // Güncellemede eski öğeler kalırsa aynı kimlikle oluşturmak hata verir; önce temizlenir
    await chrome.contextMenus.removeAll();
    for (const [id, message] of MENU_ITEMS) {
        chrome.contextMenus.create({ id, title: chrome.i18n.getMessage(message), contexts: ['action'] });
    }
});

function handleMenuClick(info) {
    if (info.menuItemId === 'settings') return chrome.runtime.openOptionsPage();
    if (info.menuItemId === 'history') return chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#history') });
    return runCapture(info.menuItemId).catch(reportFailure);
}

chrome.contextMenus.onClicked.addListener(handleMenuClick);
