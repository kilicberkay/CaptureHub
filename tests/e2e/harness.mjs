// Uçtan uca testler için ortam: yerel fikstür sunucusu, uzantılı Chromium ve servis çalışanı üzerinden komut.
// Chromium yoksa testler atlanır (bkz. capture.e2e.test.mjs).
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchWithExtension, Cdp, PageSession, wait, findChrome } from '../../tools/lib/browser.mjs';

export { wait };

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXT = join(ROOT, 'extension');
const FIXTURE_DIR = join(ROOT, 'tests', 'e2e', 'fixtures');

export const chromeAvailable = () => Boolean(findChrome());

// Servis çalışanının kimliğini ve komut arayüzünü bulur. Uzantı geç yüklenirse birkaç saniye bekler.
async function findServiceWorker(cdp) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const { targetInfos } = await cdp.send('Target.getTargets');
        for (const target of targetInfos.filter((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'))) {
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
            const ready = await cdp.send('Runtime.evaluate', { expression: 'typeof chrome !== "undefined" && !!chrome.storage', returnByValue: true }, sessionId)
                .then((r) => r.result.value === true).catch(() => false);
            if (ready) return { url: target.url, sessionId };
            await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
        }
        await wait(300);
    }
    throw new Error('CaptureHub servis çalışanı bulunamadı');
}

export async function startEnv() {
    // ?delay=ms yanıtı geciktirir (tembel görsel testi); içerik türü uzantıdan gelir
    const TYPES = { html: 'text/html; charset=utf-8', svg: 'image/svg+xml', woff2: 'font/woff2' };
    const srv = createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const name = url.pathname.replace(/^\//, '');
        await wait(Number(url.searchParams.get('delay')) || 0);
        // fonts/ uzantının yazı tiplerinden sunulur (demo.html Geist kullanır); diğer adlar fikstür klasöründen
        const font = /^fonts\/[\w-]+\.woff2$/.test(name);
        try {
            const body = readFileSync(font ? join(EXT, name) : join(FIXTURE_DIR, name.replace(/[^\w.-]/g, '')));
            res.writeHead(200, { 'content-type': TYPES[name.split('.').pop()] || 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${srv.address().port}`;

    const browser = await launchWithExtension(process.env.CAPTUREHUB_EXT_DIR || EXT, { lang: 'en-US', width: 1280, height: 800 });
    const cdp = await new Cdp(browser.browserWs).connect();
    const sw = await findServiceWorker(cdp);
    const extId = sw.url.split('/')[2];

    const downloadDir = mkdtempSync(join(tmpdir(), 'capturehub-downloads-'));
    const env = {
        base, extId, browser, cdp, srv, downloadDir,
        // Servis çalışanında ifade değerlendirir; sonuç JSON olarak döner
        swEval: async (expression) => {
            const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sw.sessionId);
            if (r.exceptionDetails) throw new Error(`SW hatası: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
            return r.result.value;
        },
        openPage: (path) => PageSession.open(cdp, `${base}/${path}`),
        // Yeni açılan sekme (düzenleyici) aktif olur; komutların doğru sekmeye gitmesi için test sayfası öne alınır
        focus: (page) => cdp.send('Target.activateTarget', { targetId: page.targetId }).then(() => wait(200)),
        openExtensionPage: (path) => PageSession.open(cdp, `chrome-extension://${extId}/${path}`),
        close: async () => {
            cdp.close();
            srv.close();
            await browser.close();
            rmSync(downloadDir, { recursive: true, force: true });
        }
    };
    return env;
}

// Tarayıcı düzeyindeki komut kısayolu (Alt+Shift+<harf>) CDP tuş olayıyla basılır; sayfa içeriği bu tuşu görmez.
// modifiers: 1 = Alt, 8 = Shift
export async function pressAltShift(env, page, letter) {
    const vk = letter.charCodeAt(0);
    const send = (type) => env.cdp.send('Input.dispatchKeyEvent', {
        type, modifiers: 9, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, code: `Key${letter}`, key: letter.toLowerCase(),
    }, page.sid);
    await send('rawKeyDown');
    await send('keyUp');
    await wait(400);
}

// Odaktaki alana metin yazar
export async function typeText(env, page, text) {
    await env.cdp.send('Input.insertText', { text }, page.sid);
    await wait(100);
}

// Tuş bileşimi (örn. Ctrl+Z): modifiers 2 = Ctrl, 8 = Shift
export async function pressKey(env, page, { key, code, vk, modifiers = 0 }) {
    const send = (type) => env.cdp.send('Input.dispatchKeyEvent', {
        type, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, code, key,
    }, page.sid);
    await send('rawKeyDown');
    await send('keyUp');
    await wait(300);
}

// Odaktaki sayfada Escape
export async function pressEscape(env, page) {
    const send = (type) => env.cdp.send('Input.dispatchKeyEvent', {
        type, windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, code: 'Escape', key: 'Escape',
    }, page.sid);
    await send('rawKeyDown');
    await send('keyUp');
    await wait(200);
}

// Sürükleme: fare basılı, hareket, bırakma (CSS pikselleri)
export async function drag(env, page, from, to) {
    const mouse = (type, point, buttons) => env.cdp.send('Input.dispatchMouseEvent', {
        type, x: point.x, y: point.y, button: 'left', buttons, clickCount: 1,
    }, page.sid);
    await mouse('mousePressed', from, 1);
    await mouse('mouseMoved', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 1);
    await mouse('mouseMoved', to, 1);
    await mouse('mouseReleased', to, 0);
    await wait(500);
}

export async function click(env, page, point) {
    await env.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 }, page.sid);
    await env.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 }, page.sid);
    await wait(500);
}

// Düzenleyici sayfasındaki tuval pikseli (görüntü koordinatları)
export async function pixelAt(page, x, y) {
    return page.eval(`(() => {
        const c = document.getElementById('canvas');
        return Array.from(c.getContext('2d').getImageData(${x}, ${y}, 1, 1).data.slice(0, 3));
    })()`);
}

