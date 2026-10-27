// README ekran görüntüleri: popup, düzenleyici (örnek işaretlerle), ayarlar ve geçmiş; açık ve koyu tema.
// Gereksinim: Chromium (CHROME_BIN veya Playwright önbelleği). Başka araç gerekmez.
// Çıktı: docs/images/{light,dark}/ (İngilizce) ve docs/images/tr/{light,dark}/ (Türkçe).
// Kullanım: node tools/make-readme-shots.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startEnv, pressAltShift, pressEscape, drag, click, ROOT } from '../tests/e2e/harness.mjs';
import { HIDE_SCROLLBARS, frameImage, demoTargets, annotateScript, wait } from './lib/capture.mjs';

const IMAGES = join(ROOT, 'docs', 'images');
const LANGS = [
    { uiLang: 'en', dir: IMAGES, label: 'Newsletter peak' },
    { uiLang: 'tr', dir: join(IMAGES, 'tr'), label: 'Bülten zirvesi' },
];

// Seçici katmanı açılana kadar kısayolu yineler; komut bazen sekme odakta değilken düşüyor
async function startSelector(env, page, letter, mode) {
    for (let i = 0; i < 3; i++) {
        await env.focus(page);
        await pressAltShift(env, page, letter);
        const open = await page.eval('Boolean(document.querySelector(\'[data-capturehub="select"]\'))');
        if (open) return;
        await wait(300);
    }
    throw new Error(`seçici açılmadı: ${mode}`);
}

async function stopSelector(env, page) {
    await pressEscape(env, page);
    await page.waitFor('!document.querySelector(\'[data-capturehub="select"]\')', 3000);
}

async function shoot(env, path, file, { width, height, dark, prepare }) {
    const page = await env.openExtensionPage(path);
    try {
        await page.waitFor('document.readyState === "complete"', 10000);
        await page.eval(HIDE_SCROLLBARS);
        if (prepare) await prepare(page);
        await wait(700);
        const h = height || await page.eval('document.documentElement.scrollHeight');
        await page.screenshot(file, { width, height: h });
        await frameImage(env.cdp, file, { width, height: h, dark });
        return file;
    } finally {
        await page.close();
    }
}

async function main() {
    const env = await startEnv();
    try {
        const demo = await env.openPage('demo.html');
        await demo.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, demo.sid);
        await demo.waitFor('document.fonts.status === "loaded"', 10000);
        await demo.eval(HIDE_SCROLLBARS);
        // Komut kısayolu activeTab iznini verir
        await env.focus(demo);
        await pressAltShift(env, demo, 'R');
        await pressEscape(env, demo);
        const targets = await demoTargets(demo);
        // Geçmiş ve popup listesinde dört mod da görünsün diye her moddan bir gerçek yakalama
        await env.focus(demo);
        await env.swEval("runCapture('full')");
        await env.focus(demo);
        await pressAltShift(env, demo, 'E');
        await env.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: targets.bar.x, y: targets.bar.y + 20 }, demo.sid);
        await click(env, demo, { x: targets.bar.x, y: targets.bar.y + 20 });
        await wait(800);
        await env.focus(demo);
        await pressAltShift(env, demo, 'R');
        await drag(env, demo, { x: 40, y: 120 }, { x: 640, y: 420 });
        await wait(800);
        await env.focus(demo);
        await env.swEval("runCapture('visible')");
        const { id } = await env.swEval('CaptureStore.list().then((rows) => rows.find((r) => r.mode === "visible"))');
        await env.swEval(`CaptureStore.update(${id}, { downloadId: 1 })`);

        for (const lang of LANGS) {
            for (const theme of ['light', 'dark']) {
                await env.swEval(`chrome.storage.local.set(${JSON.stringify({ uiLang: lang.uiLang, theme })})`);
                const dir = join(lang.dir, theme);
                mkdirSync(dir, { recursive: true });
                const dark = theme === 'dark';
                // Bölge ve öğe seçimi: mağaza görsellerindeki 02/03 karelerinin README sürümü
                const chart = targets.chart;
                const mouse = (type, x, y, buttons) => env.cdp.send('Input.dispatchMouseEvent',
                    { type, x, y, button: 'left', buttons, clickCount: 1 }, demo.sid);
                await env.focus(demo);
                await startSelector(env, demo, 'E', 'element');
                await mouse('mouseMoved', chart.x + chart.w - 8, chart.y + 8, 0);
                await wait(300);
                await demo.screenshot(join(dir, 'element.png'), { width: 1280, height: 800 });
                await frameImage(env.cdp, join(dir, 'element.png'), { width: 1280, height: 800, dark });
                await stopSelector(env, demo);
                await wait(300);

                await startSelector(env, demo, 'R', 'region');
                const end = { x: chart.x + chart.w + 10, y: chart.y + chart.h + 10 };
                await mouse('mousePressed', chart.x - 10, chart.y - 10, 1);
                await mouse('mouseMoved', end.x - 100, end.y - 60, 1);
                await mouse('mouseMoved', end.x, end.y, 1);
                await wait(300);
                await demo.screenshot(join(dir, 'region.png'), { width: 1280, height: 800 });
                await frameImage(env.cdp, join(dir, 'region.png'), { width: 1280, height: 800, dark });
                await stopSelector(env, demo);
                await mouse('mouseReleased', end.x, end.y, 0);
                await wait(300);
                await shoot(env, 'popup/popup.html', join(dir, 'popup.png'), { width: 340, dark });
                await shoot(env, `editor/editor.html?id=${id}`, join(dir, 'editor.png'), {
                    width: 1280, height: 860, dark,
                    prepare: (p) => p.waitFor('canvas.width > 0', 10000).then(() => p.eval(annotateScript(targets, lang.label)))
                });
                await shoot(env, 'options/options.html#general', join(dir, 'settings-general.png'), { width: 1100, dark });
                await shoot(env, 'options/options.html#history', join(dir, 'settings-history.png'), { width: 1100, dark });
                console.log(`${lang.uiLang}/${theme}: tamam`);
            }
        }
    } finally {
        await env.close();
    }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
