// Düzenleyici: yakalanan görüntüye işaret koyar, seçer, taşır, kırpar; kopyalar ve dışa aktarır.
const MODE_KEYS = { visible: 'modeVisible', full: 'modeFull', region: 'modeRegion', element: 'modeElement' };
const TOOL_KEYS = { v: 'select', r: 'rect', a: 'arrow', t: 'text', b: 'blur', n: 'number', h: 'highlight', c: 'crop' };
// Araç adları ve kısayol harfleri: düğme ipuçları çeviriden ve harften üretilir
const TOOL_NAMES = {
    select: ['toolSelect', 'V'], rect: ['toolRect', 'R'], arrow: ['toolArrow', 'A'], text: ['toolText', 'T'],
    blur: ['toolBlur', 'B'], number: ['toolNumber', 'N'], highlight: ['toolHighlight', 'H'], crop: ['toolCrop', 'C']
};
const SHAPE_TOOLS = ['rect', 'arrow', 'blur', 'highlight'];
const FORMATS = { png: { mime: 'image/png', ext: 'png' }, jpeg: { mime: 'image/jpeg', ext: 'jpg' }, webp: { mime: 'image/webp', ext: 'webp' } };
const HISTORY_LIMIT = 50;
// Tutamaç ve kenar yakalama toleransı ekrandaki piksel cinsinden; görüntü ölçeğine çevrilir
const HIT_CSS_PIXELS = 8;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const textInput = document.getElementById('textInput');
const stage = document.getElementById('stage');
const toolButtons = document.querySelectorAll('[data-tool]');
const colorButtons = document.querySelectorAll('[data-color]');
const sizeButtons = document.querySelectorAll('[data-size]');
const customColor = document.getElementById('customColor');

const state = {
    tool: 'rect', color: CaptureSettings.DEFAULTS.editorColor, size: CaptureSettings.DEFAULTS.editorSize,
    base: null, items: [], selected: -1,
    drawing: null, cropRect: null,
    past: [], future: [], id: null, mode: ''
};
let textAnchor = null;
let settings = {};

// Düğme ipuçları: çeviri adı ve kısayol harfi (örn. "Dikdörtgen (R)")
function setToolTitles() {
    for (const [tool, [key, letter]] of Object.entries(TOOL_NAMES)) {
        document.querySelector(`[data-tool="${tool}"]`).title = `${CaptureI18n.t(key)} (${letter})`;
    }
    document.getElementById('undo').title = `${CaptureI18n.t('undo')} (Ctrl+Z)`;
    document.getElementById('redo').title = `${CaptureI18n.t('redo')} (Ctrl+Shift+Z)`;
    document.getElementById('download').title = `${CaptureI18n.t('download')} (Ctrl+S)`;
    for (const button of sizeButtons) button.title = `${CaptureI18n.t('sizeLabel')}: ${button.textContent}`;
}

function setStatus(text) {
    document.getElementById('status').textContent = text;
}

function markActive(buttons, active, activeClass = 'chip-active', idleClass = 'chip') {
    for (const button of buttons) {
        const on = button === active;
        button.setAttribute('aria-pressed', String(on));
        button.classList.toggle(activeClass, on);
        button.classList.toggle(idleClass, !on);
    }
}

function setBase(bitmap) {
    state.base = bitmap;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
}

// Her değişiklikten önce çağrılır: geri alma yığınına o anki durum eklenir
function snapshot() {
    state.past.push({ items: structuredClone(state.items), base: state.base });
    if (state.past.length > HISTORY_LIMIT) state.past.shift();
    state.future = [];
    updateHistoryButtons();
}

function restoreEntry(entry) {
    state.items = entry.items;
    if (entry.base !== state.base) setBase(entry.base);
    state.selected = -1;
    render();
    updateHistoryButtons();
}

function undo() {
    if (state.past.length === 0) return;
    state.future.push({ items: structuredClone(state.items), base: state.base });
    restoreEntry(state.past.pop());
}

function redo() {
    if (state.future.length === 0) return;
    state.past.push({ items: structuredClone(state.items), base: state.base });
    restoreEntry(state.future.pop());
}

function updateHistoryButtons() {
    document.getElementById('undo').disabled = state.past.length === 0;
    document.getElementById('redo').disabled = state.future.length === 0;
}

// Görüntünün kendisi ve öğeler; seçim çerçevesi ve tutamaçlar dışarıda bırakılır
function drawScene(target, items) {
    target.drawImage(state.base, 0, 0);
    for (const item of items) CaptureTools.paintItem(target, item);
}

function render(preview) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawScene(ctx, state.items);
    if (preview) CaptureTools.paintItem(ctx, preview);
    const selected = state.items[state.selected];
    if (selected && !preview) {
        CaptureTools.paintSelection(ctx, selected, CaptureGeometry.handlesOf(selected), CaptureGeometry.itemBounds(selected));
    }
    if (state.tool === 'crop' && state.cropRect) paintCrop();
}

function paintCrop() {
    const c = state.cropRect;
    if (c.width < 1 || c.height < 1) return;
    ctx.save();
    ctx.fillStyle = 'rgba(9, 9, 11, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(c.x, c.y, c.width, c.height);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#f74a87';
    ctx.lineWidth = Math.max(2, Math.round(canvas.width / 600));
    ctx.strokeRect(c.x, c.y, c.width, c.height);
    ctx.restore();
}

// Dışa aktarılan görüntü: yalnız görüntü ve öğeler (seçim çerçevesi yok)
function exportCanvas() {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    drawScene(out.getContext('2d'), state.items);
    return out;
}

function toImagePoint(event) {
    const box = canvas.getBoundingClientRect();
    return {
        x: Math.min(canvas.width, Math.max(0, ((event.clientX - box.left) * canvas.width) / box.width)),
        y: Math.min(canvas.height, Math.max(0, ((event.clientY - box.top) * canvas.height) / box.height))
    };
}

function hitTolerance() {
    return (HIT_CSS_PIXELS * canvas.width) / canvas.getBoundingClientRect().width;
}

function setTool(tool) {
    state.tool = tool;
    state.cropRect = null;
    if (tool !== 'select') state.selected = -1;
    stage.dataset.activeTool = tool;
    markActive(toolButtons, document.querySelector(`[data-tool="${tool}"]`), 'chip-active', 'chip');
    document.getElementById('cropGroup').hidden = tool !== 'crop';
    render();
}

function selectedItem() {
    return state.items[state.selected];
}

// Hazır renklerden biri değilse özel renk alanı etkin görünür
function showColor(color) {
    let preset = false;
    for (const button of colorButtons) {
        const on = button.dataset.color.toLowerCase() === color.toLowerCase();
        preset = preset || on;
        button.setAttribute('aria-pressed', String(on));
    }
    customColor.parentElement.classList.toggle('active', !preset);
    customColor.value = color;
}

function showSize(size) {
    markActive(sizeButtons, document.querySelector(`[data-size="${size}"]`));
}

// Renk ve boyut seçili öğeye de uygulanır; seçim yoksa yalnız sonraki öğeler için geçerlidir. Son seçim hatırlanır.
function chooseColor(color) {
    state.color = color;
    showColor(color);
    applyToSelection({ color });
    chrome.storage.local.set({ editorColor: color });
}

function chooseSize(size) {
    state.size = size;
    showSize(size);
    applyToSelection({ size });
    chrome.storage.local.set({ editorSize: size });
}

// Numara yarıçapı ve metin boyutu öğede saklanır; boyut değişince bunlar da yeniden hesaplanır
function applyToSelection(change) {
    const item = selectedItem();
    if (!item) return;
    snapshot();
    Object.assign(item, change);
    if (change.size && item.type === 'number') item.r = CaptureTools.radiusFor(canvas.width, item.size);
    if (change.size && item.type === 'text') {
        item.px = CaptureTools.fontFor(canvas.width, item.size);
        Object.assign(item, CaptureTools.measureText(ctx, item.text, item.px));
    }
    render();
}

function openTextInput(point) {
    textAnchor = point;
    const scale = canvas.getBoundingClientRect().width / canvas.width;
    const px = CaptureTools.fontFor(canvas.width, state.size);
    textInput.value = '';
    Object.assign(textInput.style, {
        left: `${point.x * scale}px`,
        top: `${point.y * scale}px`,
        fontSize: `${px * scale}px`,
        color: state.color,
        borderColor: state.color
    });
    textInput.hidden = false;
    textInput.focus();
}

// Enter ve blur aynı işlemi çağırabilir; görünürlük denetimi metnin iki kez eklenmesini önler
function closeTextInput(commit) {
    if (textInput.hidden) return;
    const text = textInput.value.trim();
    textInput.hidden = true;
    if (!commit || !text) return;
    const px = CaptureTools.fontFor(canvas.width, state.size);
    const { w, h } = CaptureTools.measureText(ctx, text, px);
    snapshot();
    state.items.push({ type: 'text', color: state.color, size: state.size, x1: textAnchor.x, y1: textAnchor.y, text, px, w, h });
    render();
}

function endDrawing() {
    const drawing = state.drawing;
    state.drawing = null;
    if (!drawing) return;
    if (drawing.mode === 'create') {
        const item = drawing.item;
        // Yanlışlıkla tıklamada çok küçük işaret oluşmasın
        const minLength = Math.max(6, canvas.width / 200);
        if (Math.hypot(item.x2 - item.x1, item.y2 - item.y1) < minLength) return render();
        snapshot();
        state.items.push(item);
    }
    if (drawing.mode === 'crop') {
        const c = state.cropRect;
        if (c && (c.width < 1 || c.height < 1)) state.cropRect = null;
    }
    render();
}

function onPointerDown(event) {
    if (event.button !== 0 || !state.base) return;
    const point = toImagePoint(event);
    const tolerance = hitTolerance();
    canvas.setPointerCapture(event.pointerId);

    if (state.tool === 'select') {
        const selected = selectedItem();
        const handle = selected && CaptureGeometry.handlesOf(selected)
            .find((h) => Math.hypot(h.x - point.x, h.y - point.y) <= tolerance * 1.5);
        if (handle) {
            state.drawing = { mode: 'handle', index: state.selected, key: handle.key, snapshotted: false };
            return;
        }
        const index = CaptureGeometry.hitItem(state.items, point, tolerance);
        state.selected = index;
        if (index >= 0) state.drawing = { mode: 'move', index, last: point, snapshotted: false };
        return render();
    }
    if (state.tool === 'text') {
        // Açık bir metin varsa önce eklenir, sonra yeni konumda giriş açılır
        closeTextInput(true);
        return openTextInput(point);
    }
    if (state.tool === 'number') {
        snapshot();
        state.items.push({
            type: 'number', color: state.color, size: state.size, x1: point.x, y1: point.y,
            r: CaptureTools.radiusFor(canvas.width, state.size), n: CaptureGeometry.nextNumber(state.items)
        });
        return render();
    }
    if (state.tool === 'crop') {
        state.cropRect = { x: point.x, y: point.y, width: 0, height: 0 };
        state.drawing = { mode: 'crop', start: point };
        return;
    }
    if (SHAPE_TOOLS.includes(state.tool)) {
        state.drawing = {
            mode: 'create',
            item: { type: state.tool, color: state.color, size: state.size, x1: point.x, y1: point.y, x2: point.x, y2: point.y }
        };
    }
}

function onPointerMove(event) {
    const drawing = state.drawing;
    if (!drawing) return;
    const point = toImagePoint(event);
    if (drawing.mode === 'create') {
        Object.assign(drawing.item, { x2: point.x, y2: point.y });
        return render(drawing.item);
    }
    if (drawing.mode === 'move') {
        if (!drawing.snapshotted) {
            snapshot();
            drawing.snapshotted = true;
        }
        const dx = point.x - drawing.last.x;
        const dy = point.y - drawing.last.y;
        state.items[drawing.index] = CaptureGeometry.translateItem(state.items[drawing.index], dx, dy);
        drawing.last = point;
        return render();
    }
    if (drawing.mode === 'handle') {
        if (!drawing.snapshotted) {
            snapshot();
            drawing.snapshotted = true;
        }
        state.items[drawing.index] = CaptureGeometry.moveHandle(state.items[drawing.index], drawing.key, point);
        return render();
    }
    if (drawing.mode === 'crop') {
        const rect = CaptureGeometry.normalizeRect(drawing.start.x, drawing.start.y, point.x, point.y);
        state.cropRect = CaptureGeometry.clampRect(rect, canvas.width, canvas.height);
        render();
    }
}

async function applyCrop() {
    const c = state.cropRect;
    if (!c || c.width < 4 || c.height < 4) return setStatus(CaptureI18n.t('cropTooSmall'));
    const rect = { x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.width), height: Math.round(c.height) };
    const out = document.createElement('canvas');
    out.width = rect.width;
    out.height = rect.height;
    out.getContext('2d').drawImage(state.base, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const cropped = await createImageBitmap(out);
    snapshot();
    state.items = state.items.map((item) => CaptureGeometry.translateItem(item, -rect.x, -rect.y));
    setBase(cropped);
    state.cropRect = null;
    setTool('select');
    setStatus(CaptureI18n.t('cropped'));
}

function cancelCrop() {
    state.cropRect = null;
    render();
}

function deleteSelected() {
    if (state.selected < 0) return;
    snapshot();
    state.items.splice(state.selected, 1);
    state.selected = -1;
    render();
}

function nudgeSelected(dx, dy) {
    const item = selectedItem();
    if (!item) return;
    snapshot();
    state.items[state.selected] = CaptureGeometry.translateItem(item, dx, dy);
    render();
}

function toBlob(format) {
    return new Promise((resolve, reject) => {
        exportCanvas().toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error(CaptureI18n.t('imageFailed')))),
            format.mime,
            settings.quality
        );
    });
}

async function copy() {
    try {
        const blob = await toBlob(FORMATS.png);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setStatus(CaptureI18n.t('copied'));
    } catch (error) {
        setStatus(CaptureI18n.t('copyFailed', { error: error.message }));
    }
}

// İndirme kimliği geçmiş kaydına yazılır; ayarlardaki "Klasörde göster" dosyayı bununla bulur
async function download() {
    const format = FORMATS[document.getElementById('format').value];
    const name = CaptureGeometry.fileName(settings.nameTemplate, state.mode || 'yakalama', new Date(), format.ext);
    const url = URL.createObjectURL(await toBlob(format));
    try {
        const downloadId = await chrome.downloads.download({ url, filename: name, conflictAction: 'uniquify' });
        await CaptureStore.update(state.id, { downloadId });
        setStatus(CaptureI18n.t('downloaded', { name }));
    } catch (error) {
        setStatus(CaptureI18n.t('downloadFailed', { error: error.message }));
    } finally {
        // İndirme başladıktan sonra Chrome görüntüyü kendi tutar; adres serbest bırakılabilir
        URL.revokeObjectURL(url);
    }
}

canvas.addEventListener('pointerdown', onPointerDown);
// Tuvale basmak odağı gövdeye taşır; metin aracında bu, yeni açılan girişi blur ile hemen kapatırdı
canvas.addEventListener('mousedown', (event) => {
    if (state.tool === 'text') event.preventDefault();
});
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', endDrawing);
canvas.addEventListener('pointercancel', () => {
    state.drawing = null;
    render();
});

textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        closeTextInput(true);
    } else if (event.key === 'Escape') {
        event.preventDefault();
        closeTextInput(false);
    }
});
textInput.addEventListener('blur', () => closeTextInput(true));

window.addEventListener('keydown', (event) => {
    // Yazı alanlarında ve seçim kutusunda harfler araç değiştirmez
    if (event.target === textInput || event.target.matches('input, select')) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (mod && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
    } else if (mod && ((key === 'z' && event.shiftKey) || key === 'y')) {
        event.preventDefault();
        redo();
    } else if (mod && key === 's') {
        event.preventDefault();
        download();
    } else if (!mod && TOOL_KEYS[key]) {
        setTool(TOOL_KEYS[key]);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
    } else if (event.key === 'Escape') {
        if (state.tool === 'crop') cancelCrop();
        else if (state.selected >= 0) {
            state.selected = -1;
            render();
        }
    } else if (arrows[event.key] && state.selected >= 0) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        nudgeSelected(arrows[event.key][0] * step, arrows[event.key][1] * step);
    }
});

toolButtons.forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));

colorButtons.forEach((button) => button.addEventListener('click', () => chooseColor(button.dataset.color)));
customColor.addEventListener('change', () => chooseColor(customColor.value));
sizeButtons.forEach((button) => button.addEventListener('click', () => chooseSize(button.dataset.size)));

document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('copy').addEventListener('click', copy);
document.getElementById('download').addEventListener('click', download);
document.getElementById('cropApply').addEventListener('click', applyCrop);
document.getElementById('cropCancel').addEventListener('click', cancelCrop);
document.getElementById('zoom').addEventListener('click', (event) => {
    const actual = !stage.classList.contains('actual');
    stage.classList.toggle('actual', actual);
    event.currentTarget.setAttribute('aria-pressed', String(actual));
});

async function init() {
    await CaptureI18n.load();
    CaptureI18n.apply();
    setToolTitles();
    const { DEFAULTS } = CaptureSettings;
    settings = await chrome.storage.local.get({
        format: DEFAULTS.format, quality: DEFAULTS.quality, nameTemplate: DEFAULTS.nameTemplate,
        editorColor: DEFAULTS.editorColor, editorSize: DEFAULTS.editorSize
    });
    document.getElementById('format').value = settings.format in FORMATS ? settings.format : 'png';
    state.color = settings.editorColor;
    state.size = CaptureTools.SIZE_FACTOR[settings.editorSize] ? settings.editorSize : DEFAULTS.editorSize;
    showColor(state.color);
    showSize(state.size);

    const id = Number(new URLSearchParams(location.search).get('id'));
    state.id = id;
    const blob = await CaptureStore.get(id);
    if (!blob) return setStatus(CaptureI18n.t('notFound'));
    setBase(await createImageBitmap(blob));
    const meta = (await CaptureStore.list()).find((row) => row.id === id);
    state.mode = meta ? meta.mode : '';
    const sourceUrl = meta && meta.url ? meta.url : '';
    const host = CaptureGeometry.siteName(sourceUrl);
    document.title = `CaptureHub | ${CaptureI18n.t(MODE_KEYS[state.mode] || 'captureTitle')}`;
    const info = document.getElementById('info');
    info.textContent = [CaptureI18n.t(MODE_KEYS[state.mode] || 'captureTitle'), host, CaptureGeometry.dimensions(canvas.width, canvas.height)].filter(Boolean).join(' · ');
    info.title = meta && meta.title ? `${meta.title}\n${sourceUrl}` : sourceUrl;
    if (meta && meta.truncated) setStatus(CaptureI18n.t('truncated'));
    setTool(state.tool);
    updateHistoryButtons();
}

init().catch((error) => setStatus(CaptureI18n.t('openFailed', { error: error.message })));
