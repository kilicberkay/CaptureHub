// Chromium'u uzantıyla birlikte başlatan ve Chrome DevTools Protocol (CDP) üzerinden süren küçük istemci.
// Bağımlılık yoktur: Node'un yerleşik WebSocket'i ve fetch'i kullanılır. Chrome bulunamazsa çağıran atlamalıdır.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

// Sırayla: CHROME_BIN ortam değişkeni, Playwright önbellekleri (PLAYWRIGHT_BROWSERS_PATH, sonra varsayılan), yaygın sistem yolları
export function findChrome() {
    if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
    const caches = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), '.cache', 'ms-playwright')].filter(Boolean);
    for (const cache of caches) {
        if (!existsSync(cache)) continue;
        const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse();
        for (const d of dirs) {
            for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
                const p = join(cache, d, rel);
                if (existsSync(p)) return p;
            }
        }
    }
    // Markalı Google Chrome (sürüm 137 ve sonrası) --load-extension ve --disable-extensions-except bayraklarını yok sayar;
    // bu yüzden /usr/bin/google-chrome bilerek listede yoktur. Chrome for Testing bu bayrakları destekler.
    const fixed = [
        '/usr/bin/chromium', '/usr/bin/chromium-browser',
        '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    ];
    return fixed.find((p) => existsSync(p)) || null;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Uzantı klasörüyle Chromium başlatır; { port, close(), browserWs } döner
// lang: tarayıcı dili (navigator.language); verilmezse işletim sisteminin dili kullanılır
export async function launchWithExtension(extensionDir, { headless = true, width = 1280, height = 800, lang = null } = {}) {
    const chrome = findChrome();
    if (!chrome) throw new Error('Chromium bulunamadı (CHROME_BIN ayarlayın)');
    const port = await freePort();
    const userDataDir = mkdtempSync(join(tmpdir(), 'capturehub-e2e-'));
    const args = [
        headless ? '--headless=new' : '',
        '--no-sandbox',
        '--disable-gpu',
        '--enable-logging=stderr',
        '--v=1',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        `--load-extension=${extensionDir}`,
        `--disable-extensions-except=${extensionDir}`,
        `--window-size=${width},${height}`,
        lang ? `--lang=${lang}` : '',
        'about:blank',
    ].filter(Boolean);
    const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });

    let version = null;
    for (let i = 0; i < 100 && !version; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            version = await res.json();
        } catch {
            if (proc.exitCode !== null) throw new Error(`Chromium erken kapandı: ${stderr.slice(-400)}`);
            await sleep(100);
        }
    }
    if (!version) throw new Error('CDP uç noktası açılmadı');

    const close = async () => {
        proc.kill('SIGKILL');
        await sleep(200);
        rmSync(userDataDir, { recursive: true, force: true });
    };
    return { port, browserWs: version.webSocketDebuggerUrl, close, chrome, stderrTail: () => {
            // Geçici profil yolu (capturehub-e2e-…) her satırda geçtiği için ayrıca dışlanır; yalnız eklenti ile ilgili satırlar kalır
            const keep = stderr.split('\n').filter((l) => /extension|manifest|service_worker|Failed to load|Could not load|ERROR:/i.test(l)
                && !/dbus|gcm|capturehub-e2e|Cannot stat|component_updater|omnibox/i.test(l));
            return [...keep.slice(0, 30), '...', ...keep.slice(-20)].join('\n').slice(0, 4000);
        } }
}

// Tek bir WebSocket üzerinde CDP komutları ve olayları
export class Cdp {
    constructor(url) {
        this.url = url;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
    }

    async connect() {
        this.ws = new WebSocket(this.url);
        await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = () => reject(new Error(`CDP bağlantısı kurulamadı: ${this.url}`));
        });
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject, method } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
                else resolve(msg.result);
            } else if (msg.method) {
                for (const fn of this.listeners.get(msg.method) || []) fn(msg.params, msg.sessionId);
            }
        };
        return this;
    }

    send(method, params = {}, sessionId) {
        const id = this.nextId++;
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        this.ws.send(JSON.stringify(payload));
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
    }

    on(method, fn) {
        if (!this.listeners.has(method)) this.listeners.set(method, []);
        this.listeners.get(method).push(fn);
    }

    close() { try { this.ws.close(); } catch { /* yoksay */ } }
}

// Sayfa oturumu: değerlendirme, bekleme ve konsol hatası toplama
export class PageSession {
    constructor(cdp, sessionId, targetId, url) {
        this.cdp = cdp;
        this.sid = sessionId;
        this.targetId = targetId;
        this.url = url;
        this.errors = [];
    }

    static async open(cdp, url) {
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        const page = new PageSession(cdp, sessionId, targetId, url);
        page.cdp.on('Runtime.exceptionThrown', (p, sid) => {
            if (sid === page.sid) page.errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'istisna');
        });
        page.cdp.on('Runtime.consoleAPICalled', (p, sid) => {
            if (sid === page.sid && p.type === 'error') page.errors.push(p.args.map((a) => a.value ?? a.description).join(' '));
        });
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);
        await page.goto(url);
        return page;
    }

    async goto(url) {
        await this.cdp.send('Page.navigate', { url }, this.sid);
        await this.waitFor('document.readyState === "complete"', 10000);
        this.url = url;
    }

    async eval(expression) {
        const res = await this.cdp.send('Runtime.evaluate', {
            expression, awaitPromise: true, returnByValue: true,
        }, this.sid);
        if (res.exceptionDetails) {
            throw new Error(`eval hatası: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
        }
        return res.result.value;
    }

    async waitFor(expression, timeout = 5000) {
        const end = Date.now() + timeout;
        while (Date.now() < end) {
            try {
                if (await this.eval(`!!(${expression})`)) return true;
            } catch { /* henüz hazır değil */ }
            await sleep(100);
        }
        throw new Error(`zaman aşımı: ${expression}`);
    }

    async screenshot(file, { width = 1280, height = 800, scale = 1 } = {}) {
        const { writeFileSync } = await import('node:fs');
        await this.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, this.sid);
        const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, this.sid);
        writeFileSync(file, Buffer.from(data, 'base64'));
        return file;
    }

    async close() {
        try { await this.cdp.send('Target.closeTarget', { targetId: this.targetId }); } catch { /* zaten kapalı */ }
    }
}

export const wait = sleep;
