// Uçtan uca: gerçek Chromium'da uzantıyı yükler, yakalama modlarını ve düzenleyiciyi sınar.
// Çalıştırma: npm run test:e2e   (Chromium yoksa atlanır; CHROME_BIN ile yol verilebilir)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromeAvailable, startEnv, pressAltShift, pressEscape, pressKey, typeText, drag, click, pixelAt, wait } from './harness.mjs';

const SKIP = chromeAvailable() ? false : 'Chromium bulunamadı (CHROME_BIN ayarlayın)';
// tall.html: sabit üst başlık (#111), altı renk bandı, sabit alt bar (#222) ve sayfa sonunda bir kutu
const HEADER = [17, 17, 17];
const FOOTER = [34, 34, 34];
const BANDS = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]];

describe('CaptureHub uçtan uca', { skip: SKIP, timeout: 300000 }, () => {
    let env;
    let page;

    const latest = () => env.swEval('CaptureStore.list().then((rows) => rows[0])');
    const count = () => env.swEval('CaptureStore.list().then((rows) => rows.length)');

    async function openEditor(id) {
        const editor = await env.openExtensionPage(`editor/editor.html?id=${id}`);
        await editor.waitFor('document.getElementById("info").textContent.length > 0', 10000);
        return editor;
    }

    before(async () => {
        env = await startEnv();
        page = await env.openPage('tall.html');
        await page.waitFor('document.readyState === "complete"', 10000);
        // Komut kısayolu activeTab iznini verir; bölge katmanı hemen Esc ile kapatılır
        await pressAltShift(env, page, 'R');
        await pressEscape(env, page);
    });

    after(async () => {
        if (env) await env.close();
    });

    it('görünür alan: kayıt, sayfa görünümü boyutunda; üst başlık ve bant doğru', async () => {
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const meta = await latest();
        assert.equal(meta.mode, 'visible');
        const dpr = await page.eval('window.devicePixelRatio');
        assert.equal(meta.width, Math.round((await page.eval('window.innerWidth')) * dpr));
        const editor = await openEditor(meta.id);
        assert.deepEqual(await pixelAt(editor, 600, 30), HEADER, 'sabit başlık görünür alanda');
        assert.deepEqual(await pixelAt(editor, 600, 300), BANDS[0], 'ilk bant');
        await editor.close();
    });

    it('tam sayfa: yükseklik sayfaya eşit; sabit öğeler yalnız uçta; bantlar yerinde', async () => {
        await env.focus(page);
        await env.swEval('runCapture("full")');
        const meta = await latest();
        assert.equal(meta.mode, 'full');
        assert.equal(meta.truncated, false);
        const pageHeight = await page.eval('document.documentElement.scrollHeight');
        assert.equal(meta.height, pageHeight);
        assert.equal(meta.width, await page.eval('document.documentElement.clientWidth'), 'kaydırma çubuğu görüntüye girmez');
        const editor = await openEditor(meta.id);
        assert.deepEqual(await pixelAt(editor, 600, 30), HEADER, 'üst başlık ilk dilimde');
        assert.deepEqual(await pixelAt(editor, 600, 520), BANDS[1], 'ortada başlık tekrar etmez');
        assert.deepEqual(await pixelAt(editor, 600, 1250), BANDS[2], 'bant birleşimi');
        assert.deepEqual(await pixelAt(editor, 600, meta.height - 10), FOOTER, 'alt bar son dilimde');
        await editor.close();
    });

    it('bölge: sürükleme seçimin boyutunda kayıt oluşturur', async () => {
        await env.focus(page);
        const before = await count();
        await pressAltShift(env, page, 'R');
        await drag(env, page, { x: 100, y: 100 }, { x: 400, y: 300 });
        await wait(800);
        const meta = await latest();
        assert.equal(meta.mode, 'region');
        assert.equal(meta.width, 300);
        assert.equal(meta.height, 200);
        assert.equal(await count(), before + 1);
    });

    it('bölge: Esc seçimi iptal eder, kayıt oluşmaz', async () => {
        await env.focus(page);
        const before = await count();
        await pressAltShift(env, page, 'R');
        await pressEscape(env, page);
        await wait(500);
        assert.equal(await count(), before);
    });

    it('bölge: 4 pikselden küçük seçim kayıt oluşturmaz', async () => {
        await env.focus(page);
        const before = await count();
        await pressAltShift(env, page, 'R');
        await drag(env, page, { x: 50, y: 50 }, { x: 52, y: 52 });
        await wait(500);
        assert.equal(await count(), before);
    });

    // Kullanıcı gibi: kısayol, fare öğenin üstüne gelir, tıklar
    it('öğe: Alt+Shift+E, üstüne gelip tıklanan öğenin kutusu kadar kayıt oluşur', async () => {
        await env.focus(page);
        await page.eval('window.scrollTo(0, 1100)');
        await wait(200);
        const before = await count();
        await pressAltShift(env, page, 'E');
        await env.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 140, y: 140 }, page.sid);
        await env.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 150, y: 150 }, page.sid);
        await click(env, page, { x: 150, y: 150 });
        await wait(800);
        assert.equal(await count(), before + 1, 'kayıt oluşmalı');
        const meta = await latest();
        assert.equal(meta.mode, 'element');
        assert.equal(meta.width, 200);
        assert.equal(meta.height, 100);
        assert.equal(await page.eval('document.querySelector("[data-capturehub]") === null'), true, 'katman kaldırılır');
        await page.eval('window.scrollTo(0, 0)');
    });

    it('öğe: fare hareketi olmadan doğrudan tıklama da öğeyi yakalar', async () => {
        await env.focus(page);
        await page.eval('window.scrollTo(0, 1100)');
        await wait(200);
        await env.swEval('runCapture("element")');
        await click(env, page, { x: 160, y: 160 });
        await wait(800);
        const meta = await latest();
        assert.equal(meta.mode, 'element');
        assert.equal(meta.width, 200);
        assert.equal(meta.height, 100);
        await page.eval('window.scrollTo(0, 0)');
    });

    it('öğe: açık kalmış bir bölge seçimi varken öğe modu onun yerine geçer', async () => {
        await env.focus(page);
        await page.eval('window.scrollTo(0, 1100)');
        await wait(200);
        await pressAltShift(env, page, 'R');
        await pressAltShift(env, page, 'E');
        assert.equal(await page.eval('document.querySelectorAll("[data-capturehub]").length'), 1, 'tek katman');
        await env.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 150, y: 150 }, page.sid);
        await click(env, page, { x: 150, y: 150 });
        await wait(800);
        const meta = await latest();
        assert.equal(meta.mode, 'element');
        assert.equal(meta.width, 200);
        await page.eval('window.scrollTo(0, 0)');
    });

    it('öğe: görünümden uzun öğe kaydırılıp birleştirilerek tam boyda yakalanır', async () => {
        await env.focus(page);
        await page.eval('window.scrollTo(0, 0)');
        await wait(200);
        await pressAltShift(env, page, 'E');
        await env.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 450, y: 600 }, page.sid);
        await click(env, page, { x: 450, y: 600 });
        await page.waitFor('document.querySelector("[data-capturehub]") === null', 5000);
        await wait(4000);
        const meta = await latest();
        assert.equal(meta.mode, 'element');
        assert.deepEqual([meta.width, meta.height], [100, 1500]);
        const editor = await openEditor(meta.id);
        assert.deepEqual(await pixelAt(editor, 50, 1490), [68, 85, 102], 'öğenin alt ucu da görüntüde');
        await editor.close();
        assert.equal(await page.eval('window.scrollY'), 0, 'sayfa eski konumuna döner');
    });

    it('öğe: ↑ üst öğeye çıkar, Enter onu yakalar', async () => {
        await env.focus(page);
        await page.eval('window.scrollTo(0, 1100)');
        await wait(200);
        await pressAltShift(env, page, 'E');
        await env.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 150, y: 150 }, page.sid);
        await wait(100);
        assert.match(await page.eval('document.querySelector("[data-capturehub] span").textContent'), /^200 × 100 · ↑↓$/);
        await pressKey(env, page, { key: 'ArrowUp', code: 'ArrowUp', vk: 38 });
        assert.match(await page.eval('document.querySelector("[data-capturehub] span").textContent'), /× 3000/, 'body vurgulanır');
        await pressKey(env, page, { key: 'ArrowDown', code: 'ArrowDown', vk: 40 });
        assert.match(await page.eval('document.querySelector("[data-capturehub] span").textContent'), /^200 × 100/, '↓ geri iner');
        await pressKey(env, page, { key: 'ArrowUp', code: 'ArrowUp', vk: 38 });
        await pressKey(env, page, { key: 'Enter', code: 'Enter', vk: 13 });
        await page.waitFor('document.querySelector("[data-capturehub]") === null', 5000);
        await wait(8000);
        const meta = await latest();
        assert.equal(meta.height, 3000, 'üst öğe (body) tam boyda');
        await page.eval('window.scrollTo(0, 0)');
    });

    it('bölge: alt kenarda tutulunca sayfa kayar ve seçim görünümü aşar', async () => {
        await env.focus(page);
        await page.eval('window.scrollTo(0, 0)');
        await wait(200);
        const vh = await page.eval('window.innerHeight');
        await pressAltShift(env, page, 'R');
        const mouse = (type, point, buttons) => env.cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', buttons, clickCount: 1 }, page.sid);
        await mouse('mousePressed', { x: 100, y: 100 }, 1);
        await mouse('mouseMoved', { x: 300, y: vh - 4 }, 1);
        await wait(1200);
        assert.ok(await page.eval('window.scrollY') > 100, 'sayfa kaydı');
        await mouse('mouseReleased', { x: 300, y: vh - 4 }, 0);
        await page.waitFor('document.querySelector("[data-capturehub]") === null', 5000);
        await wait(6000);
        const meta = await latest();
        assert.equal(meta.mode, 'region');
        assert.equal(meta.width, 200);
        assert.ok(meta.height > vh, `yükseklik ${meta.height} > ${vh}`);
        await page.eval('window.scrollTo(0, 0)');
    });

    it('tam sayfa: tembel yüklenen görsel boş kalmaz', async () => {
        const lazy = await env.openPage('lazy.html');
        await env.focus(lazy);
        await pressAltShift(env, lazy, 'R');
        await pressEscape(env, lazy);
        await env.swEval('runCapture("full")');
        const meta = await latest();
        const editor = await openEditor(meta.id);
        assert.deepEqual(await pixelAt(editor, 300, 2600), [0, 170, 85], 'görsel yüklenmiş');
        await editor.close();
        await lazy.close();
    });

    it('tam sayfa: 20000 px sayfa kesilmez; WebP sınırı açık iletiyle bildirilir', async () => {
        const long = await env.openPage('long.html');
        await env.focus(long);
        await pressAltShift(env, long, 'R');
        await pressEscape(env, long);
        await env.swEval('runCapture("full")');
        const meta = await latest();
        assert.equal(meta.height, 20000);
        assert.equal(meta.truncated, false);
        const editor = await openEditor(meta.id);
        assert.deepEqual(await pixelAt(editor, 300, 19950), [170, 0, 0], 'en alttaki bant');
        await editor.eval(`document.getElementById('format').value = 'webp'`);
        await editor.eval('document.getElementById("download").click()');
        await editor.waitFor('document.getElementById("status").textContent.includes("WebP")', 5000);
        await editor.close();
        await long.close();
    });

    it('hata: kısıtlı sayfada neden simgenin ipucuna yazılır', async () => {
        const restricted = await env.openPage('tall.html');
        await restricted.goto('chrome://version');
        await env.focus(restricted);
        await env.swEval('runCapture("visible").catch(reportFailure)');
        assert.equal(await env.swEval('chrome.action.getTitle({})'), 'CaptureHub: This page cannot be captured.');
        assert.equal(await env.swEval('chrome.action.getBadgeText({})'), '!');
        await restricted.close();
    });

    it('kaynak: kayıt sayfa adresini ve başlığını saklar', async () => {
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const meta = await latest();
        assert.equal(meta.url, `${env.base}/tall.html`);
        assert.equal(meta.title, 'Tall fixture');
    });

    it('menü: sağ tık öğeleri kurulu; işleyici yakalama başlatır ve geçmişi açar', async () => {
        for (const id of ['visible', 'full', 'region', 'element', 'history', 'settings']) {
            const exists = await env.swEval(`new Promise((resolve) => chrome.contextMenus.update('${id}', {}, () => resolve(!chrome.runtime.lastError)))`);
            assert.equal(exists, true, `menü öğesi: ${id}`);
        }
        await env.focus(page);
        const before = await count();
        await env.swEval("handleMenuClick({ menuItemId: 'visible' })");
        assert.equal(await count(), before + 1);
        await env.swEval("handleMenuClick({ menuItemId: 'history' })");
        await wait(500);
        const { targetInfos } = await env.cdp.send('Target.getTargets');
        assert.ok(targetInfos.some((t) => t.url.endsWith('options/options.html#history')), 'geçmiş sekmesi açılır');
    });

    it('düzenleyici: dikdörtgen çizilir ve Ctrl+Z ile geri alınır', async () => {
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const meta = await latest();
        const editor = await openEditor(meta.id);
        const box = JSON.parse(await editor.eval('JSON.stringify(document.getElementById("canvas").getBoundingClientRect())'));
        const canvasWidth = await editor.eval('document.getElementById("canvas").width');
        const k = box.width / canvasWidth;
        const toCss = (x, y) => ({ x: box.left + x * k, y: box.top + y * k });
        const original = await pixelAt(editor, 300, 200);

        await drag(env, editor, toCss(200, 200), toCss(400, 320));
        const drawn = await pixelAt(editor, 300, 200);
        assert.ok(drawn[0] > 200 && drawn[1] < 120, `dikdörtgen kenarı pembe olmalı, bulunan ${drawn}`);

        await pressKey(env, editor, { key: 'z', code: 'KeyZ', vk: 90, modifiers: 2 });
        assert.deepEqual(await pixelAt(editor, 300, 200), original, 'geri alma özgün pikseli döndürür');
        await editor.close();
    });


    async function canvasHelpers(editor) {
        const box = JSON.parse(await editor.eval('JSON.stringify(document.getElementById("canvas").getBoundingClientRect())'));
        const k = box.width / (await editor.eval('document.getElementById("canvas").width'));
        return (x, y) => ({ x: box.left + x * k, y: box.top + y * k });
    }

    it('düzenleyici: Metin aracı tıklamada açık kalır, yazılan metin Enter ile eklenir', async () => {
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const editor = await openEditor((await latest()).id);
        const toCss = await canvasHelpers(editor);
        const sumArea = () => editor.eval('Array.from(document.getElementById("canvas").getContext("2d").getImageData(300, 200, 120, 40).data).reduce((a, b) => a + b, 0)');
        const original = await sumArea();
        await editor.eval('document.querySelector("[data-tool=text]").click()');
        await click(env, editor, toCss(300, 200));
        assert.equal(await editor.eval('document.activeElement === document.getElementById("textInput") && !textInput.hidden'), true, 'giriş açık ve odakta');
        await typeText(env, editor, 'Merhaba');
        await pressKey(env, editor, { key: 'Enter', code: 'Enter', vk: 13 });
        assert.deepEqual(JSON.parse(await editor.eval('JSON.stringify(state.items.map((i) => [i.type, i.text]))')), [['text', 'Merhaba']]);
        assert.notEqual(await sumArea(), original, 'metin tuvale çizilir');
        await editor.close();
    });

    it('düzenleyici: renk yuvarlakları koyu temada renkli; özel renk ve XL boyut kullanılır ve hatırlanır', async () => {
        await env.swEval("chrome.storage.local.set({ theme: 'dark' })");
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const editor = await openEditor((await latest()).id);
        await editor.waitFor('document.documentElement.classList.contains("dark")', 3000);
        assert.equal(await editor.eval('getComputedStyle(document.querySelector("[data-color=\'#ef4444\']")).backgroundColor'), 'rgb(239, 68, 68)');
        assert.equal(await editor.eval('document.querySelectorAll("[data-size]").length'), 5);
        await editor.eval(`(() => {
            const input = document.getElementById('customColor');
            input.value = '#123abc';
            input.dispatchEvent(new Event('change'));
            document.querySelector('[data-size="xl"]').click();
        })()`);
        const toCss = await canvasHelpers(editor);
        await drag(env, editor, toCss(200, 200), toCss(400, 320));
        assert.deepEqual(JSON.parse(await editor.eval('JSON.stringify(state.items.map((i) => [i.color, i.size]))')), [['#123abc', 'xl']]);
        assert.equal(await editor.eval('document.getElementById("customColor").parentElement.classList.contains("active")'), true);
        assert.deepEqual(await env.swEval("chrome.storage.local.get(['editorColor', 'editorSize'])"), { editorColor: '#123abc', editorSize: 'xl' });
        await editor.close();
        await env.swEval("chrome.storage.local.remove(['editorColor', 'editorSize'])");
    });

    it('düzenleyici: seçili numara ve metnin boyutu değişince yarıçap ve yazı boyutu da değişir', async () => {
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const editor = await openEditor((await latest()).id);
        const toCss = await canvasHelpers(editor);
        await editor.eval('document.querySelector("[data-tool=number]").click()');
        await click(env, editor, toCss(600, 300));
        const r = await editor.eval('state.items[0].r');
        await editor.eval('document.querySelector("[data-tool=select]").click()');
        await click(env, editor, toCss(600, 300));
        assert.equal(await editor.eval('state.selected'), 0);
        await editor.eval('document.querySelector("[data-size=xl]").click()');
        assert.ok(await editor.eval('state.items[0].r') > r, 'yarıçap büyür');
        await editor.close();
        await env.swEval("chrome.storage.local.remove('editorSize')");
    });

    // tall.html 1100 px kaydırılınca #box (#123456) mavi bandın (#0000ff) üstünde, görüntüde (100..300, 100..200)
    async function boxEditor() {
        await env.focus(page);
        await page.eval('window.scrollTo(0, 1100)');
        await wait(200);
        await env.swEval('runCapture("visible")');
        await page.eval('window.scrollTo(0, 0)');
        const editor = await openEditor((await latest()).id);
        return { editor, toCss: await canvasHelpers(editor) };
    }
    const isBlue = ([r, g, b]) => r < 30 && g < 30 && b > 225;

    it('düzenleyici: iyileştirme fırçası kutuyu zemin rengiyle siler; Ctrl+Z geri getirir', async () => {
        const { editor, toCss } = await boxEditor();
        assert.deepEqual(await pixelAt(editor, 200, 150), [18, 52, 86], 'başta kutu rengi');
        await pressKey(env, editor, { key: 'j', code: 'KeyJ', vk: 74 });
        assert.equal(await editor.eval('state.tool'), 'heal');
        await editor.eval('document.querySelector("[data-size=xl]").click()');
        // Tek darbe (bırakılınca doldurulur): kutuyu zikzakla örter
        const mouse = (type, point, buttons) => env.cdp.send('Input.dispatchMouseEvent',
            { type, ...point, button: 'left', buttons, clickCount: 1 }, editor.sid);
        const path = [[85, 110], [315, 110], [315, 150], [85, 150], [85, 190], [315, 190]].map(([x, y]) => toCss(x, y));
        await mouse('mousePressed', path[0], 1);
        for (const point of path.slice(1)) await mouse('mouseMoved', point, 1);
        await mouse('mouseReleased', path.at(-1), 0);
        await wait(800);
        for (const [x, y] of [[200, 150], [110, 110], [290, 190]]) assert.ok(isBlue(await pixelAt(editor, x, y)), `${x},${y}: ${await pixelAt(editor, x, y)}`);
        assert.equal(await editor.eval('state.items.length'), 0, 'işaret eklenmez, taban değişir');
        await pressKey(env, editor, { key: 'z', code: 'KeyZ', vk: 90, modifiers: 2 });
        assert.deepEqual(await pixelAt(editor, 200, 150), [18, 52, 86], 'geri alındı');
        await editor.close();
        await env.swEval("chrome.storage.local.remove('editorSize')");
    });

    it('düzenleyici: içeriğe duyarlı doldurma seçilen dikdörtgeni siler', async () => {
        const { editor, toCss } = await boxEditor();
        await pressKey(env, editor, { key: 'f', code: 'KeyF', vk: 70 });
        assert.equal(await editor.eval('state.tool'), 'fill');
        await drag(env, editor, toCss(94, 94), toCss(306, 206));
        await wait(500);
        for (const [x, y] of [[200, 150], [102, 102], [298, 198]]) assert.ok(isBlue(await pixelAt(editor, x, y)), `${x},${y}: ${await pixelAt(editor, x, y)}`);
        await editor.close();
    });

    it('düzenleyici: kalem ve elips çizilir; kalem seçilip silinir; araç tuşları P ve E', async () => {
        const { editor, toCss } = await boxEditor();
        await pressKey(env, editor, { key: 'p', code: 'KeyP', vk: 80 });
        await drag(env, editor, toCss(500, 300), toCss(700, 400));
        await pressKey(env, editor, { key: 'e', code: 'KeyE', vk: 69 });
        await drag(env, editor, toCss(800, 300), toCss(1000, 450));
        assert.deepEqual(JSON.parse(await editor.eval('JSON.stringify(state.items.map((i) => i.type))')), ['pen', 'ellipse']);
        assert.ok(await editor.eval('state.items[0].points.length') >= 2);
        await editor.eval('document.querySelector("[data-tool=select]").click()');
        await click(env, editor, toCss(600, 350));
        assert.equal(await editor.eval('state.selected'), 0, 'kalem çizgisi seçilir');
        await pressKey(env, editor, { key: 'Delete', code: 'Delete', vk: 46 });
        assert.deepEqual(JSON.parse(await editor.eval('JSON.stringify(state.items.map((i) => i.type))')), ['ellipse']);
        await editor.close();
    });

    it('düzenleyici: döndür boyutları değiştirir, işaret de döner; boyutlandır oranı korur; damlalık düğmesi API ile görünür', async () => {
        const { editor } = await boxEditor();
        const [w, h] = JSON.parse(await editor.eval('JSON.stringify([canvas.width, canvas.height])'));
        await editor.eval(`state.items.push({ type: 'number', color: '#f74a87', size: 'm', x1: 100, y1: 20, r: 12, n: 1 }); render()`);
        await editor.eval('document.getElementById("rotate").click()');
        await editor.waitFor(`canvas.width === ${h}`, 3000);
        assert.equal(await editor.eval('canvas.height'), w);
        assert.deepEqual(JSON.parse(await editor.eval('JSON.stringify([state.items[0].x1, state.items[0].y1])')), [h - 20, 100]);
        assert.deepEqual(await pixelAt(editor, h - 150, 200), [18, 52, 86], 'kutu da döndü');
        await pressKey(env, editor, { key: 'z', code: 'KeyZ', vk: 90, modifiers: 2 });
        assert.equal(await editor.eval('canvas.width'), w);

        await editor.eval('document.getElementById("resize").click()');
        assert.equal(await editor.eval('document.getElementById("resizeDialog").open'), true);
        await editor.eval(`(() => {
            const input = document.getElementById('resizeWidth');
            input.value = '${w / 2}';
            input.dispatchEvent(new Event('input'));
            document.querySelector('#resizeForm [value=apply]').click();
        })()`);
        await editor.waitFor(`canvas.width === ${w / 2}`, 3000);
        assert.equal(await editor.eval('canvas.height'), Math.round(h / 2));
        assert.deepEqual(JSON.parse(await editor.eval('JSON.stringify([state.items[0].x1, state.items[0].r])')), [50, 6]);
        assert.equal(await editor.eval('document.getElementById("eyedropper").hidden'), !(await editor.eval('"EyeDropper" in window')));
        await editor.close();
    });

    it('düzenleyici: düzenlemeler otomatik kaydedilir, yeniden açınca gelir; Orijinale dön temizler', async () => {
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const { id } = await latest();
        let editor = await openEditor(id);
        assert.equal(await editor.eval('document.getElementById("revert").hidden'), true);
        const toCss = await canvasHelpers(editor);
        await editor.eval('document.querySelector("[data-tool=rect]").click()');
        await drag(env, editor, toCss(200, 200), toCss(400, 320));
        await editor.waitFor('document.getElementById("revert").hidden === false', 3000);
        await wait(1200);
        await editor.close();
        editor = await openEditor(id);
        assert.equal(await editor.eval('state.items.length'), 1, 'işaret geri geldi');
        await editor.eval('window.confirm = () => true; document.getElementById("revert").click()');
        assert.equal(await editor.eval('state.items.length'), 0);
        await wait(1200);
        await editor.close();
        editor = await openEditor(id);
        assert.equal(await editor.eval('state.items.length'), 0, 'orijinal kaldı');
        assert.equal(await editor.eval('document.getElementById("revert").hidden'), true);
        await editor.close();
    });

    it('düzenleyici: metin çok satırlı yazılır, çift tıklamayla düzenlenir, boşaltılınca silinir', async () => {
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const editor = await openEditor((await latest()).id);
        const toCss = await canvasHelpers(editor);
        await editor.eval('document.querySelector("[data-tool=text]").click()');
        await click(env, editor, toCss(300, 200));
        await typeText(env, editor, 'Bir\nİki');
        await pressKey(env, editor, { key: 'Enter', code: 'Enter', vk: 13 });
        const item = JSON.parse(await editor.eval('JSON.stringify(state.items[0])'));
        assert.equal(item.text, 'Bir\nİki');
        assert.ok(item.h >= item.px * 2.4, `iki satır yüksekliği: ${item.h}`);
        await editor.eval('document.querySelector("[data-tool=select]").click()');
        const dbl = toCss(310, 210);
        for (const clickCount of [1, 2]) {
            await env.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...dbl, button: 'left', buttons: 1, clickCount }, editor.sid);
            await env.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...dbl, button: 'left', buttons: 0, clickCount }, editor.sid);
        }
        await editor.waitFor('!textInput.hidden && textInput.value === "Bir\\nİki"', 3000);
        await editor.eval('textInput.value = "Yeni"');
        await pressKey(env, editor, { key: 'Enter', code: 'Enter', vk: 13 });
        assert.deepEqual(JSON.parse(await editor.eval('JSON.stringify(state.items.map((i) => i.text))')), ['Yeni']);
        await editor.eval('openTextInput(null, 0); textInput.value = ""');
        await pressKey(env, editor, { key: 'Enter', code: 'Enter', vk: 13 });
        assert.equal(await editor.eval('state.items.length'), 0, 'boş metin silinir');
        await editor.close();
    });

    it('düzenleyici: Ctrl+tekerlek yakınlaştırır, 0 sığdırır, 1 %100 yapar; Ctrl+C kopyalar', async () => {
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const editor = await openEditor((await latest()).id);
        const fit = await editor.eval('canvas.getBoundingClientRect().width');
        const center = await canvasHelpers(editor).then((toCss) => toCss(400, 300));
        await env.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...center, deltaX: 0, deltaY: -100, modifiers: 2 }, editor.sid);
        await wait(200);
        assert.ok(await editor.eval('canvas.getBoundingClientRect().width') > fit, 'büyüdü');
        assert.match(await editor.eval('document.getElementById("zoom").textContent'), /^\d+%$/);
        await pressKey(env, editor, { key: '0', code: 'Digit0', vk: 48 });
        assert.equal(await editor.eval('canvas.getBoundingClientRect().width'), fit, 'sığdır');
        await pressKey(env, editor, { key: '1', code: 'Digit1', vk: 49 });
        assert.equal(await editor.eval('document.getElementById("zoom").textContent'), '100%');
        await pressKey(env, editor, { key: 'c', code: 'KeyC', vk: 67, modifiers: 2 });
        await editor.waitFor('document.getElementById("status").textContent.length > 0', 3000);
        assert.match(await editor.eval('document.getElementById("status").textContent'), /Copied|copy/i);
        await editor.close();
    });

    it('geçmiş: ayarlarda ve popup\'ta küçük resim; {site} dosya adına girer', async () => {
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const options = await env.openExtensionPage('options/options.html#history');
        await options.waitFor('document.querySelector(".history-thumb") && document.querySelector(".history-thumb").naturalWidth > 0', 5000);
        await options.close();
        const popup = await env.openExtensionPage('popup/popup.html');
        await popup.waitFor('document.querySelector(".thumb") && document.querySelector(".thumb").naturalWidth > 0', 5000);
        await popup.close();
        await env.swEval("chrome.storage.local.set({ nameTemplate: '{site}-{mode}', format: 'png' })");
        await env.cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: env.downloadDir });
        const editor = await openEditor((await latest()).id);
        await editor.eval('document.getElementById("download").click()');
        await editor.waitFor('document.getElementById("status").textContent.includes("127.0.0.1-visible.png")', 5000);
        await editor.close();
        await env.swEval("chrome.storage.local.remove(['nameTemplate', 'format'])");
    });

    it('düzenleyici: İndir, indirme kimliğini geçmiş kaydına yazar; ayarlarda Klasörde göster görünür', async () => {
        await env.cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: env.downloadDir });
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const meta = await latest();
        const editor = await openEditor(meta.id);
        await editor.eval('document.getElementById("download").click()');
        await editor.waitFor('document.getElementById("status").textContent.length > 0', 5000);
        const saved = await env.swEval(`CaptureStore.list().then((rows) => rows.find((r) => r.id === ${meta.id}))`);
        assert.ok(Number.isInteger(saved.downloadId), `downloadId: ${saved.downloadId}`);
        await editor.close();
        const options = await env.openExtensionPage('options/options.html#history');
        await options.waitFor('document.querySelectorAll(".history-row").length > 0', 5000);
        const first = await options.eval('Array.from(document.querySelector(".history-row").querySelectorAll("button")).map((b) => b.textContent)');
        assert.deepEqual(first, ['Open', 'Show in folder', 'Delete']);
        assert.equal(await options.eval('document.querySelector(".history-site").textContent'), '127.0.0.1');
        await options.close();
    });

    it('geçmiş sınırı: ayar 10 iken en eski kayıtlar silinir', async () => {
        await env.focus(page);
        await env.swEval('chrome.storage.local.set({ historyLimit: 10 })');
        for (let i = 0; i < 12; i++) {
            await env.swEval("CaptureStore.save(new Blob([new Uint8Array(8)], { type: 'image/png' }), { mode: 'visible', width: 1, height: 1, truncated: false })");
        }
        assert.equal(await count(), 10);
        // Ayarlarda sınır düşürülünce fazlası hemen silinir
        const options = await env.openExtensionPage('options/options.html');
        await options.waitFor('document.getElementById("historyLimit").value === "10"', 5000);
        await env.swEval('chrome.storage.local.set({ historyLimit: 30 })');
        for (let i = 0; i < 3; i++) {
            await env.swEval("CaptureStore.save(new Blob([new Uint8Array(8)], { type: 'image/png' }), { mode: 'visible', width: 1, height: 1, truncated: false })");
        }
        assert.equal(await count(), 13);
        await options.eval(`(() => { const s = document.getElementById('historyLimit'); s.value = '10'; s.dispatchEvent(new Event('change')); })()`);
        await wait(300);
        assert.equal(await count(), 10, 'sınır hemen uygulanır');
        await options.close();
        await env.swEval('chrome.storage.local.set({ historyLimit: 30 })');
    });

    it('popup: dört yakalama modu ve gecikme seçimi var', async () => {
        const popup = await env.openExtensionPage('popup/popup.html');
        await popup.waitFor('document.querySelectorAll("[data-mode]").length === 4', 5000);
        assert.equal(await popup.eval('document.querySelectorAll("[data-delay]").length'), 4);
        await popup.close();
    });

    it('ayarlar: geçmişte arama başlık ve adrese göre süzer', async () => {
        // Geçmiş sınırı testi adressiz kayıtlar bıraktı; aranacak bir gerçek yakalama eklenir
        await env.focus(page);
        await env.swEval('runCapture("visible")');
        const options = await env.openExtensionPage('options/options.html#history');
        await options.waitFor('document.querySelectorAll(".history-row").length > 0', 5000);
        const all = await options.eval('document.querySelectorAll(".history-row").length');
        await options.eval(`(() => { const s = document.getElementById('historySearch'); s.value = 'tall fixture'; s.dispatchEvent(new Event('input')); })()`);
        await options.waitFor('document.querySelectorAll(".history-row").length > 0', 3000);
        const filtered = await options.eval('document.querySelectorAll(".history-row").length');
        assert.ok(filtered > 0 && filtered < all, `süzülmüş ${filtered} / ${all}`);
        await options.eval(`(() => { const s = document.getElementById('historySearch'); s.value = 'yok-boyle-bir-sey'; s.dispatchEvent(new Event('input')); })()`);
        await options.waitFor('!document.getElementById("historyEmpty").hidden', 3000);
        await options.close();
    });

    it('ayarlar: kısayollar listesi dört komutu Alt+Shift atamalarıyla gösterir', async () => {
        const options = await env.openExtensionPage('options/options.html#shortcuts');
        await options.waitFor('document.querySelectorAll("#shortcutList dt").length === 4', 5000);
        const keys = await options.eval('Array.from(document.querySelectorAll("#shortcutList kbd")).map((k) => k.textContent)');
        assert.deepEqual(keys, ['Alt+Shift+V', 'Alt+Shift+F', 'Alt+Shift+R', 'Alt+Shift+E']);
        const names = await options.eval('Array.from(document.querySelectorAll("#shortcutList dt")).map((d) => d.textContent)');
        assert.deepEqual(names, ['Visible area', 'Full page', 'Select region', 'Select element']);
        await options.close();
    });

    it('ayarlar: yedek içe aktarılır, geçersiz dosya ayarları değiştirmez, sıfırlama varsayılana döner', async () => {
        const options = await env.openExtensionPage('options/options.html');
        await options.waitFor('document.getElementById("theme").value.length > 0', 5000);
        await options.eval(`importSettings(new File(['{"format":"capturehub-settings","version":1,"settings":{"format":"webp","delay":5}}'], 'a.json'))`);
        await wait(800);
        assert.deepEqual(await env.swEval("chrome.storage.local.get(['format', 'delay'])"), { format: 'webp', delay: 5 });
        await options.waitFor('document.getElementById("format").value === "webp"', 5000);
        await options.eval(`importSettings(new File(['{"format":"capturehub-settings","version":1,"settings":{"format":"exe"}}'], 'b.json'))`);
        await options.waitFor('document.getElementById("status").textContent.includes("not a valid")', 3000);
        assert.equal(await env.swEval("chrome.storage.local.get('format').then((v) => v.format)"), 'webp');
        await options.eval('window.confirm = () => true; resetSettings()');
        await wait(800);
        assert.deepEqual(await env.swEval("chrome.storage.local.get(['format', 'delay'])"), {});
        await options.close();
    });

    it('tema: ayarlardaki seçim açık sayfalara canlı uygulanır; sistem seçeneği işletim sistemini izler', async () => {
        const popup = await env.openExtensionPage('popup/popup.html');
        const options = await env.openExtensionPage('options/options.html');
        await options.waitFor('document.getElementById("theme").value.length > 0', 5000);
        const choose = (value) => options.eval(`(() => { const s = document.getElementById('theme'); s.value = '${value}'; s.dispatchEvent(new Event('change')); })()`);
        await choose('light');
        await popup.waitFor('!document.documentElement.classList.contains("dark")', 3000);
        await choose('dark');
        await popup.waitFor('document.documentElement.classList.contains("dark")', 3000);
        await env.cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, popup.sid);
        await choose('system');
        await popup.waitFor('!document.documentElement.classList.contains("dark")', 3000);
        // Medya sorgusu değişikliği yalnız görünür sekmede bildirilir; popup öne alınır
        await env.focus(popup);
        await env.cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, popup.sid);
        await popup.waitFor('document.documentElement.classList.contains("dark")', 3000);
        assert.deepEqual(popup.errors, []);
        assert.deepEqual(options.errors, []);
        await env.swEval("chrome.storage.local.remove('theme')");
        await popup.close();
        await options.close();
    });
});
