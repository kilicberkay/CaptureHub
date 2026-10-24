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
