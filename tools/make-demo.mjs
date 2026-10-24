// README için tanıtım videosu: bölge seçimi, leke iyileştirme, düzenleyicide işaretleme, indirme ve tam sayfa yakalama.
// Kareler gerçek uzantıdan (Chromium, CDP) alınır; düzenleyici yeni sekmede açılınca kayıt o sekmeden sürer.
// Çıktılar: docs/videos/demo-<dil>.mp4 (1280×800, 30 kare/sn) ve docs/images/[tr/]demo.gif (960 px, 12 kare/sn).
// Gereksinim: Chromium (CHROME_BIN veya Playwright önbelleği) ve ffmpeg.
// Kullanım: node tools/make-demo.mjs [en|tr]
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startEnv, pressAltShift, pressEscape, typeText, ROOT } from '../tests/e2e/harness.mjs';
import { PageSession } from './lib/browser.mjs';
import { HIDE_SCROLLBARS, FAKE_CURSOR, demoTargets, wait } from './lib/capture.mjs';

const lang = process.argv[2] === 'tr' ? 'tr' : 'en';
const gifFile = join(ROOT, 'docs', 'images', lang === 'tr' ? 'tr' : '', 'demo.gif');
const mp4File = join(ROOT, 'docs', 'videos', `demo-${lang}.mp4`);
const SIZE = { width: 1280, height: 800 };
const CAPTIONS = {
    en: ['Alt+Shift+R · Select a region', 'Spot healing: brush over what you want gone',
        'Annotate: arrow, text, numbers, box', 'Download as PNG, JPEG or WebP', 'Alt+Shift+F · Full page, stitched automatically'],
    tr: ['Alt+Shift+R · Bölge seç', 'Leke iyileştirme: silmek istediğinizin üstünden geçin',
        'İşaretle: ok, metin, numara, kutu', 'PNG, JPEG ya da WebP olarak indir', 'Alt+Shift+F · Tam sayfa, otomatik birleştirilir']
}[lang];
const LABEL = lang === 'tr' ? 'Bülten zirvesi' : 'Newsletter peak';

// Sayfanın alt köşesinde kısa açıklama; yalnızca kayıt sırasında eklenir, yakalamadan önce gizlenir
function captionScript(text) {
    return `(() => {
        let el = document.getElementById('capturehub-demo-caption');
        if (!el) {
            el = document.createElement('div');
            el.id = 'capturehub-demo-caption';
            el.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:2147483646;padding:9px 16px;border-radius:10px;'
                + 'background:rgba(24,24,27,.86);color:#fafafa;font:600 15px/1.3 Geist,system-ui,sans-serif;direction:ltr;pointer-events:none';
            document.documentElement.appendChild(el);
        }
        el.style.display = ${text ? "'block'" : "'none'"};
        el.textContent = ${JSON.stringify(text || '')};
    })()`;
}

// Kareleri arka planda alır; açık sayfa sahne geçişinde değişir (stage.page)
function startRecording(stage, dir) {
    const frames = [];
    let running = true;
    const started = performance.now();
    const loop = (async () => {
        while (running) {
            try {
                const { page } = stage;
                const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 }, page.sid);
                const file = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
                writeFileSync(file, Buffer.from(data, 'base64'));
                frames.push({ file, at: (performance.now() - started) / 1000 });
            } catch {
                await wait(30); // sekme geçişinde kısa süre kare alınamayabilir
            }
        }
    })();
    return async () => {
        running = false;
        await loop;
        return frames;
    };
}

// ffmpeg concat listesi: her kare, bir sonraki karenin başlangıcına kadar gösterilir
function concatList(frames) {
    const lines = frames.map((f, i) => {
        const end = i + 1 < frames.length ? frames[i + 1].at : f.at + 0.1;
        return `file '${f.file}'\nduration ${(end - f.at).toFixed(3)}`;
    });
    lines.push(`file '${frames.at(-1).file}'`);
    return `${lines.join('\n')}\n`;
}

// Fare yumuşak hareket eder; buttons 1 ise sürükleme
async function moveMouse(page, from, to, { steps = 18, buttons = 0 } = {}) {
    for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: buttons ? 'left' : 'none', buttons }, page.sid);
        await wait(16);
    }
    return to;
}

async function press(page, point, type) {
    await page.cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }, page.sid);
}

async function prepare(page) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { ...SIZE, deviceScaleFactor: 1, mobile: false }, page.sid);
    await page.eval(HIDE_SCROLLBARS);
    await page.eval(FAKE_CURSOR);
}

// Yeni açılan düzenleyici sekmesine bağlanır; önceki düzenleyiciler (skip) atlanır
async function attachEditor(env, skip = []) {
    for (let i = 0; i < 100; i++) {
        const { targetInfos } = await env.cdp.send('Target.getTargets');
        const target = targetInfos.find((t) => t.type === 'page' && t.url.includes('editor/editor.html') && !skip.includes(t.targetId));
        if (target) {
            const { sessionId } = await env.cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
            const page = new PageSession(env.cdp, sessionId, target.targetId, target.url);
            await env.cdp.send('Page.enable', {}, sessionId);
            await env.cdp.send('Runtime.enable', {}, sessionId);
            await page.waitFor('canvas.width > 0', 10000);
            return page;
        }
        await wait(100);
    }
    throw new Error('düzenleyici sekmesi açılmadı');
}

async function main() {
    const dir = mkdtempSync(join(tmpdir(), 'capturehub-demo-'));
    const env = await startEnv();
    try {
        await env.swEval(`chrome.storage.local.set(${JSON.stringify({ uiLang: lang, theme: 'light' })})`);
        const demo = await env.openPage('demo.html');
        await demo.waitFor('document.fonts.status === "loaded"', 10000);
        await prepare(demo);
        await env.focus(demo);
        const { chart, bar } = await demoTargets(demo);
        const stage = { page: demo };
        const stop = startRecording(stage, dir);

        // 1. Bölge: kısayol, grafik kartının çevresinde sürükleme
        await demo.eval(captionScript(CAPTIONS[0]));
        let mouse = await moveMouse(demo, { x: 900, y: 650 }, { x: chart.x - 10, y: chart.y - 10 }, { steps: 30 });
        await wait(500);
        await pressAltShift(env, demo, 'R');
        await wait(500);
        await press(demo, mouse, 'mousePressed');
        mouse = await moveMouse(demo, mouse, { x: chart.x + chart.w + 10, y: chart.y + chart.h + 10 }, { steps: 40, buttons: 1 });
        await wait(600);
        // İmleç ve açıklama ekran görüntüsüne girmesin
        await demo.eval(`${captionScript('')}; window.__demoCursor(false)`);
        await press(demo, mouse, 'mouseReleased');

        // 2. Düzenleyici: araçlar fareyle seçilir, işaretler çizilir
        const editor = await attachEditor(env);
        await prepare(editor);
        stage.page = editor;
        await editor.eval(captionScript(CAPTIONS[1]));
        const box = JSON.parse(await editor.eval('JSON.stringify(canvas.getBoundingClientRect())'));
        const k = box.width / (await editor.eval('canvas.width'));
        // Görüntü koordinatı: bölge, grafik kartının 10 px dışından başlar
        const at = (x, y) => ({ x: box.left + (x - chart.x + 10) * k, y: box.top + (y - chart.y + 10) * k });
        const center = async (selector) => {
            const r = JSON.parse(await editor.eval(`JSON.stringify(document.querySelector('${selector}').getBoundingClientRect())`));
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        };
        const clickAt = async (point) => {
            mouse = await moveMouse(editor, mouse, point);
            await press(editor, point, 'mousePressed');
            await press(editor, point, 'mouseReleased');
            await wait(250);
        };
        const dragTo = async (from, to) => {
            mouse = await moveMouse(editor, mouse, from);
            await press(editor, from, 'mousePressed');
            mouse = await moveMouse(editor, from, to, { steps: 24, buttons: 1 });
            await press(editor, to, 'mouseReleased');
            await wait(300);
        };
        mouse = { x: 640, y: 500 };
        await wait(600);
        const right = bar.x + bar.w;
        // Leke iyileştirme: kart başlığı tek darbede silinir
        await clickAt(await center('[data-size="l"]'));
        await clickAt(await center('[data-tool="heal"]'));
        await dragTo(at(chart.x + 14, chart.y + 32), at(chart.x + 150, chart.y + 32));
        await wait(900);
        await editor.eval(captionScript(CAPTIONS[2]));
        await clickAt(await center('[data-tool="arrow"]'));
        await dragTo(at(right + 62, bar.y + 14), at(right + 8, bar.y + 40));
        await clickAt(await center('[data-tool="text"]'));
        await clickAt(at(right + 70, bar.y - 8));
        for (const ch of LABEL) await typeText(env, editor, ch);
        await editor.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, editor.sid);
        await wait(300);
        await clickAt(await center('[data-color="#f59e0b"]'));
        await clickAt(await center('[data-tool="number"]'));
        await clickAt(at(bar.x + bar.w / 2, bar.y + 34));
        await clickAt(at(chart.x + 60, chart.y + chart.h - 60));
        await clickAt(await center('[data-color="#f74a87"]'));
        await clickAt(await center('[data-tool="rect"]'));
        await dragTo(at(bar.x - 8, bar.y - 8), at(right + 8, chart.y + chart.h - 34));
        await clickAt(await center('[data-size="m"]'));
        await wait(800);

        // 3. İndir
        await editor.eval(captionScript(CAPTIONS[3]));
        await clickAt(await center('#download'));
        await wait(1800);

        // 4. Tam sayfa: sayfaya dönülür, kayıt kaydırmayı da gösterir
        stage.page = demo;
        await env.focus(demo);
        await demo.eval(`window.__demoCursor(false); ${captionScript(CAPTIONS[4])}`);
        await wait(1200);
        await demo.eval(captionScript(''));
        await pressAltShift(env, demo, 'F');
        const full = await attachEditor(env, [editor.targetId]);
        await prepare(full);
        await full.eval(captionScript(CAPTIONS[4]));
        stage.page = full;
        await wait(900);
        for (let y = 0; y <= 700; y += 35) {
            await full.eval(`window.scrollTo(0, ${y})`);
            await wait(40);
        }
        await wait(1200);
        const frames = await stop();

        const list = join(dir, 'frames.txt');
        writeFileSync(list, concatList(frames));
        mkdirSync(dirname(mp4File), { recursive: true });
        mkdirSync(dirname(gifFile), { recursive: true });
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
            '-vf', 'fps=30,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
            '-movflags', '+faststart', mp4File]);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
            '-filter_complex', '[0:v]fps=12,scale=960:-2:flags=lanczos,split[a][b];'
            + '[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
            '-loop', '0', gifFile]);
        console.log(`${frames.length} kare kaydedildi`);
    } finally {
        await env.close();
        rmSync(dir, { recursive: true, force: true });
    }
    console.log(`${mp4File}: ${(statSync(mp4File).size / 1024).toFixed(0)} KB`);
    console.log(`${gifFile}: ${(statSync(gifFile).size / 1024).toFixed(0)} KB`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
