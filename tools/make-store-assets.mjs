// Mağaza ve README görselleri: simge (128 px), tanıtım kutuları (440×280, 1400×560), sosyal önizleme (1280×640),
// README afişi ve 1280×800 ekran görüntüleri (İngilizce ve Türkçe). Hepsi Chromium'da çizilir; başka araç gerekmez.
// Kullanım: node tools/make-store-assets.mjs
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startEnv, pressAltShift, pressEscape, ROOT } from '../tests/e2e/harness.mjs';
import { HIDE_SCROLLBARS, renderHtml, fontFaces, demoTargets, annotateScript, wait } from './lib/capture.mjs';

const OUT = join(ROOT, 'store', 'assets');
const SHOTS = join(OUT, 'screenshots');
const LOGO = `data:image/svg+xml;base64,${readFileSync(join(ROOT, 'extension', 'icons', 'logo.svg')).toString('base64')}`;

const TEXT = {
    en: {
        tagline: 'Capture, annotate and share screenshots, right in Chrome.',
        features: 'VISIBLE AREA · FULL PAGE · REGION · ELEMENT · NO DATA COLLECTION',
        short: 'Screenshots and annotation',
        label: 'Newsletter peak'
    },
    tr: { label: 'Bülten zirvesi' }
};

// Marka degradesi ve ızgara: FillHub tanıtım görselleriyle aynı dil
function tileHtml({ width, height, layout }) {
    const t = TEXT.en;
    const base = `${fontFaces(ROOT)}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}`
        + 'body{display:flex;align-items:center;justify-content:center;color:#fff;font-family:Geist,sans-serif;'
        + 'background:linear-gradient(rgb(255 255 255/.1) 1px,transparent 1px) 0 0/40px 40px,'
        + 'linear-gradient(90deg,rgb(255 255 255/.1) 1px,transparent 1px) 0 0/40px 40px,'
        + 'linear-gradient(135deg,#fb7aa8,#f74a87 45%,#c2185b)}'
        + '.mono{font-family:"Geist Mono",monospace;font-weight:500;letter-spacing:.16em;opacity:.85}h1{margin:0;font-weight:700}p{margin:0}'
        + 'img{border-radius:22%;box-shadow:0 18px 40px -16px rgb(0 0 0/.35)}';
    if (layout === 'small') {
        return `<style>${base}body{flex-direction:column;gap:14px;text-align:center}h1{font-size:40px;letter-spacing:-1px}p{font-size:17px;opacity:.95}</style>`
            + `<img src="${LOGO}" width="92" height="92"><h1>CaptureHub</h1><p>${t.short}</p>`;
    }
    if (layout === 'marquee') {
        return `<style>${base}body{gap:52px;justify-content:flex-start;padding-left:110px;box-sizing:border-box}`
            + 'h1{font-size:96px;letter-spacing:-3px}.t{font-size:30px;margin:10px 0 26px;opacity:.95}.mono{font-size:17px}</style>'
            + `<img src="${LOGO}" width="180" height="180"><div><h1>CaptureHub</h1><p class="t">${t.tagline}</p><p class="mono">${t.features}</p></div>`;
    }
    return `<style>${base}body{flex-direction:column;text-align:center}h1{font-size:88px;letter-spacing:-2.6px;margin-top:28px}`
        + '.t{font-size:30px;margin:12px 0 30px;opacity:.95}.mono{font-size:16px}</style>'
        + `<img src="${LOGO}" width="150" height="150"><h1>CaptureHub</h1><p class="t">${t.tagline}</p>`
        + '<p class="mono">GITHUB.COM/KILICBERKAY/CAPTUREHUB</p>';
}

// Simge: 128 px tuval, 96 px sanat + 16 px saydam kenar (Chrome Web Store kuralı)
function iconHtml() {
    return `<style>html,body{margin:0;background:transparent}img{display:block;margin:16px}</style><img src="${LOGO}" width="96" height="96">`;
}

async function screenshots(env, uiLang, dir) {
    mkdirSync(dir, { recursive: true });
    const size = { width: 1280, height: 800 };
    const demo = await env.openPage('demo.html');
    try {
        await demo.cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false }, demo.sid);
        await demo.waitFor('document.fonts.status === "loaded"', 10000);
        await demo.eval(HIDE_SCROLLBARS);
        await env.focus(demo);

        // 02: bölge seçimi sürerken (karartma, seçim kutusu ve boyut etiketi), grafik kartının çevresinde.
        // Kısayol bu sekmeye activeTab da verir.
        const { chart } = await demoTargets(demo);
        await pressAltShift(env, demo, 'R');
        const mouse = (type, x, y, buttons) => env.cdp.send('Input.dispatchMouseEvent',
            { type, x, y, button: 'left', buttons, clickCount: 1 }, demo.sid);
        const end = { x: chart.x + chart.w + 10, y: chart.y + chart.h + 10 };
        await mouse('mousePressed', chart.x - 10, chart.y - 10, 1);
        await mouse('mouseMoved', end.x - 100, end.y - 60, 1);
        await mouse('mouseMoved', end.x, end.y, 1);
        await wait(300);
        await demo.screenshot(join(dir, '02-region.png'), size);
        await pressEscape(env, demo);
        await mouse('mouseReleased', end.x, end.y, 0);
        await wait(300);

        // 03: öğe seçimi; fare kartın kenar boşluğunda, böylece kartın kendisi vurgulanır
        await pressAltShift(env, demo, 'E');
        await mouse('mouseMoved', chart.x + chart.w - 8, chart.y + 8, 0);
        await wait(300);
        await demo.screenshot(join(dir, '03-element.png'), size);
        await pressEscape(env, demo);

        // 01: düzenleyici, örnek işaretlerle (görünür alan yakalaması)
        await env.focus(demo);
        await env.swEval('runCapture("visible")');
        const { id } = await env.swEval('CaptureStore.list().then((rows) => rows[0])');
        await env.swEval(`chrome.storage.local.set(${JSON.stringify({ uiLang, theme: 'light' })})`);
        const editor = await env.openExtensionPage(`editor/editor.html?id=${id}`);
        await editor.waitFor('canvas.width > 0', 10000);
        await editor.eval(HIDE_SCROLLBARS);
        await editor.eval(annotateScript(await demoTargets(demo), (TEXT[uiLang] || TEXT.en).label));
        await wait(400);
        await editor.screenshot(join(dir, '01-editor.png'), size);
        await editor.close();
    } finally {
        await demo.close();
    }

    for (const [file, path, theme] of [['04-settings.png', 'options/options.html#general', 'dark'], ['05-history.png', 'options/options.html#history', 'light']]) {
        await env.swEval(`chrome.storage.local.set(${JSON.stringify({ uiLang, theme })})`);
        const page = await env.openExtensionPage(path);
        await page.eval(HIDE_SCROLLBARS);
        await wait(700);
        await page.screenshot(join(dir, file), size);
        await page.close();
    }
}

async function main() {
    mkdirSync(OUT, { recursive: true });
    const env = await startEnv();
    try {
        await renderHtml(env.cdp, iconHtml(), join(OUT, 'store-icon-128.png'), { width: 128, height: 128, transparent: true });
        await renderHtml(env.cdp, tileHtml({ width: 440, height: 280, layout: 'small' }), join(OUT, 'promo-small-440x280.png'), { width: 440, height: 280 });
        await renderHtml(env.cdp, tileHtml({ width: 1400, height: 560, layout: 'marquee' }), join(OUT, 'promo-marquee-1400x560.png'), { width: 1400, height: 560 });
        await renderHtml(env.cdp, tileHtml({ width: 1280, height: 640, layout: 'social' }), join(OUT, 'social-preview-1280x640.png'), { width: 1280, height: 640 });
        mkdirSync(join(ROOT, 'docs', 'images'), { recursive: true });
        copyFileSync(join(OUT, 'promo-marquee-1400x560.png'), join(ROOT, 'docs', 'images', 'banner.png'));
        console.log('simge, tanıtım kutuları ve afiş: tamam');

        for (const uiLang of ['en', 'tr']) {
            await screenshots(env, uiLang, join(SHOTS, uiLang));
            console.log(`ekran görüntüleri (${uiLang}): tamam`);
        }
    } finally {
        await env.close();
    }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
