// README, mağaza görselleri ve tanıtım videosu için ortak yardımcılar. Ek araç gerekmez: çerçeveleme ve
// tanıtım kutuları da Chromium'da HTML olarak çizilip ekran görüntüsü alınır.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PageSession, wait } from './browser.mjs';

export { wait };

// Kaydırma çubuğu kareye girmesin; yalnızca kayıt ve görsel sayfalarına eklenir
export const HIDE_SCROLLBARS = `(() => {
    const s = document.createElement('style');
    s.textContent = 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}';
    document.head.appendChild(s);
})()`;

// Headless Chromium imleç çizmez; kayıtta fareyi izleyen bir ok gösterilir. Seçim katmanının üstünde kalması için
// her harekette belgenin sonuna taşınır. window.__demoCursor(false) gizler (yakalamadan önce).
export const FAKE_CURSOR = `(() => {
    if (window.__demoCursor) return;
    const el = document.createElement('div');
    el.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l14 8-6 1.5L8 18z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(el.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: '2147483647', pointerEvents: 'none' });
    document.documentElement.appendChild(el);
    window.addEventListener('mousemove', (e) => {
        if (document.documentElement.lastElementChild !== el) document.documentElement.appendChild(el);
        el.style.left = (e.clientX - 3) + 'px';
        el.style.top = (e.clientY - 2) + 'px';
    }, true);
    window.__demoCursor = (show) => { el.style.display = show ? 'block' : 'none'; };
})()`;

// Tek kullanımlık sayfada HTML çizer ve PNG kaydeder; transparent ile arka plan saydam olur.
// lang ve dir verilirse belgeye yazılır: yazı tipi seçimi (CJK, Arapça, Devanagari) ve yazı yönü buna bağlıdır.
export async function renderHtml(cdp, html, file, { width, height, transparent = false, lang, dir }) {
    const page = await PageSession.open(cdp, 'about:blank');
    try {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, page.sid);
        if (transparent) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, page.sid);
        const { frameTree } = await cdp.send('Page.getFrameTree', {}, page.sid);
        await cdp.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, page.sid);
        if (lang) await page.eval(`document.documentElement.lang = ${JSON.stringify(lang)}`);
        if (dir) await page.eval(`document.documentElement.dir = ${JSON.stringify(dir)}`);
        await page.waitFor('document.fonts.status === "loaded" && [...document.images].every((i) => i.complete)', 10000);
        await wait(150);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, page.sid);
        writeFileSync(file, Buffer.from(data, 'base64'));
        return file;
    } finally {
        await page.close();
    }
}

// Yazı tipleri sayfaya veri adresi olarak gömülür (about:blank dosya okuyamaz)
export function fontFaces(root) {
    const face = (family, weight, name) => {
        const data = readFileSync(join(root, 'extension', 'fonts', name)).toString('base64');
        return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2');}`;
    };
    return face('Geist', 400, 'geist-400-normal-B40WzpMT.woff2') + face('Geist', 600, 'geist-600-normal-CSETrqM2.woff2')
        + face('Geist', 700, 'geist-700-normal-CFi8mLqe.woff2') + face('Geist Mono', 500, 'geist-mono-500-normal-YINYabwD.woff2');
}

// Ekran görüntüsüne yuvarlak köşe ve ince kenarlık verir (README); dosyayı yerinde değiştirir
export async function frameImage(cdp, file, { width, height, dark = false, radius = 14 }) {
    const data = readFileSync(file).toString('base64');
    const border = dark ? '#3f3f46' : '#d4d4d8';
    const html = `<style>html,body{margin:0;background:transparent}img{display:block;width:${width}px;height:${height}px;`
        + `border-radius:${radius}px;outline:2px solid ${border};outline-offset:-2px}</style>`
        + `<img src="data:image/png;base64,${data}">`;
    return renderHtml(cdp, html, file, { width, height, transparent: true });
}

// Demo sayfasında işaretlenecek yerler (CSS pikseli; yakalama 1:1 olduğundan görüntü pikseliyle aynı)
export function demoTargets(page) {
    return page.eval(`JSON.stringify((() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
        const cards = document.querySelectorAll('.stats .card');
        return {
            revenue: r(cards[0]), customers: r(cards[1]), bar: r(document.querySelector('.bar.hi')), chart: r(document.getElementById('chart')),
            user: r(document.querySelector('.user')), topRow: r(document.querySelector('ul.list li'))
        };
    })())`).then(JSON.parse);
}

// Düzenleyicide örnek işaretler: kutu, ok + metin, numaralar, e-posta bulanıklaştırma, satır vurgusu.
// Hepsi görünür alanın içinde kalır (yakalama 1280×713).
export function annotateScript(t, label) {
    return `(() => {
        const t = ${JSON.stringify(t)};
        const W = canvas.width;
        const pink = '#f74a87';
        const item = (o) => state.items.push({ size: 'm', ...o });
        item({ type: 'rect', color: pink, x1: t.revenue.x - 6, y1: t.revenue.y - 6, x2: t.revenue.x + t.revenue.w + 6, y2: t.revenue.y + t.revenue.h + 6 });
        // Metin çubuğun sağında, sağdaki kartla çakışmayacak kadar yukarıda; ok metnin başından çubuğa
        const right = t.bar.x + t.bar.w;
        item({ type: 'arrow', color: pink, x1: right + 62, y1: t.bar.y + 14, x2: right + 8, y2: t.bar.y + 40 });
        const px = CaptureTools.fontFor(W, 'm');
        const text = ${JSON.stringify(label)};
        item({ type: 'text', color: pink, x1: right + 70, y1: t.bar.y - 8, text, px, ...CaptureTools.measureText(ctx, text, px) });
        const r = CaptureTools.radiusFor(W, 'm');
        item({ type: 'number', color: '#f59e0b', x1: t.revenue.x + t.revenue.w - 8, y1: t.revenue.y + 8, r, n: 1 });
        item({ type: 'number', color: '#f59e0b', x1: t.customers.x + t.customers.w - 8, y1: t.customers.y + 8, r, n: 2 });
        const u = t.user;
        item({ type: 'blur', color: pink, x1: u.x - 4, y1: u.y - 2, x2: u.x + u.w + 4, y2: u.y + u.h + 2 });
        const row = t.topRow;
        item({ type: 'highlight', color: '#f59e0b', x1: row.x - 6, y1: row.y + 2, x2: row.x + row.w + 6, y2: row.y + row.h - 2 });
        render();
    })()`;
}
