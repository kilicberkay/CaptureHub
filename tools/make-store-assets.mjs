// Mağaza ve README görselleri: simge (128 px), sosyal önizleme (1280×640), README afişi ve her arayüz dili için
// tanıtım kutuları (440×280, 1400×560) ile 1280×800 ekran görüntüleri. Hepsi Chromium'da çizilir; başka araç gerekmez.
// Kullanım: node tools/make-store-assets.mjs
// Çıktılar: store/assets/promo/<dil>/ ve store/assets/screenshots/<dil>/ (dil adları extension/_locales ile aynı).
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startEnv, pressAltShift, pressEscape, ROOT } from '../tests/e2e/harness.mjs';
import { HIDE_SCROLLBARS, renderHtml, fontFaces, demoTargets, annotateScript, wait } from './lib/capture.mjs';

const OUT = join(ROOT, 'store', 'assets');
const SHOTS = join(OUT, 'screenshots');
const PROMO = join(OUT, 'promo');
const LOGO = `data:image/svg+xml;base64,${readFileSync(join(ROOT, 'extension', 'icons', 'logo.svg')).toString('base64')}`;
const LOCALES = readdirSync(join(ROOT, 'extension', '_locales')).sort();
const RTL = new Set(['ar', 'ur']);

// Her dil için tanıtım metinleri ve ekran görüntüsündeki örnek işaret. Örnek sayfa İngilizcedir (demo.html);
// işaret metni yalnızca arayüz dilini gösterir.
const TEXT = {
    ar: { short: 'لقطات الشاشة والتعليقات', tagline: 'التقط لقطات الشاشة وعلّق عليها واحفظها داخل Chrome.', features: 'المنطقة المرئية · الصفحة كاملة · منطقة · عنصر · بلا جمع بيانات', label: 'ذروة النشرة البريدية' },
    bn: { short: 'স্ক্রিনশট ও চিহ্নিতকরণ', tagline: 'Chrome-এ স্ক্রিনশট নিন, চিহ্নিত করুন ও সংরক্ষণ করুন।', features: 'দৃশ্যমান অংশ · পুরো পেজ · অঞ্চল · উপাদান · কোনো ডেটা সংগ্রহ নেই', label: 'নিউজলেটারের শীর্ষ' },
    de: { short: 'Screenshots und Markierungen', tagline: 'Screenshots in Chrome aufnehmen, markieren und speichern.', features: 'SICHTBARER BEREICH · GANZE SEITE · BEREICH · ELEMENT · KEINE DATENERHEBUNG', label: 'Newsletter-Höchststand' },
    en: { short: 'Screenshots and annotation', tagline: 'Capture, annotate and save screenshots in Chrome.', features: 'VISIBLE AREA · FULL PAGE · REGION · ELEMENT · NO DATA COLLECTION', label: 'Newsletter peak' },
    es: { short: 'Capturas de pantalla y anotaciones', tagline: 'Capture, anote y guarde capturas de pantalla en Chrome.', features: 'ÁREA VISIBLE · PÁGINA COMPLETA · REGIÓN · ELEMENTO · SIN RECOPILAR DATOS', label: 'Pico del boletín' },
    fr: { short: "Captures d'écran et annotations", tagline: "Capturez, annotez et enregistrez vos captures d'écran dans Chrome.", features: 'ZONE VISIBLE · PAGE ENTIÈRE · ZONE · ÉLÉMENT · AUCUNE COLLECTE DE DONNÉES', label: 'Pic de la newsletter' },
    hi: { short: 'स्क्रीनशॉट और एनोटेशन', tagline: 'Chrome में स्क्रीनशॉट लें, चिह्नित करें और सहेजें।', features: 'दिखाई देने वाला क्षेत्र · पूरा पेज · क्षेत्र · एलिमेंट · कोई डेटा संग्रह नहीं', label: 'न्यूज़लेटर का शिखर' },
    id: { short: 'Tangkapan layar dan anotasi', tagline: 'Tangkap, beri anotasi, dan simpan tangkapan layar di Chrome.', features: 'AREA TERLIHAT · SELURUH HALAMAN · AREA · ELEMEN · TANPA PENGUMPULAN DATA', label: 'Puncak buletin' },
    ja: { short: 'スクリーンショットと注釈', tagline: 'Chrome でスクリーンショットを撮影・注釈・保存できます。', features: '表示領域 · ページ全体 · 範囲 · 要素 · データ収集なし', label: 'ニュースレターのピーク' },
    pt_BR: { short: 'Capturas de tela e anotações', tagline: 'Capture, anote e salve capturas de tela no Chrome.', features: 'ÁREA VISÍVEL · PÁGINA INTEIRA · REGIÃO · ELEMENTO · SEM COLETA DE DADOS', label: 'Pico da newsletter' },
    ru: { short: 'Снимки экрана и пометки', tagline: 'Снимайте, отмечайте и сохраняйте снимки экрана в Chrome.', features: 'ВИДИМАЯ ОБЛАСТЬ · ВСЯ СТРАНИЦА · ОБЛАСТЬ · ЭЛЕМЕНТ · БЕЗ СБОРА ДАННЫХ', label: 'Пик рассылки' },
    tr: { short: 'Ekran görüntüsü ve işaretleme', tagline: "Chrome'da ekran görüntüsü alın, işaretleyin ve kaydedin.", features: 'GÖRÜNÜR ALAN · TAM SAYFA · BÖLGE · ÖĞE · VERİ TOPLAMA YOK', label: 'Bülten zirvesi' },
    ur: { short: 'اسکرین شاٹ اور نشان دہی', tagline: 'Chrome میں اسکرین شاٹ لیں، نشان لگائیں اور محفوظ کریں۔', features: 'نظر آنے والا حصہ · پوری صفحہ · علاقہ · عنصر · کوئی ڈیٹا جمع نہیں', label: 'نیوز لیٹر کی بلندی' },
    vi: { short: 'Ảnh chụp màn hình và chú thích', tagline: 'Chụp, chú thích và lưu ảnh màn hình ngay trong Chrome.', features: 'VÙNG HIỂN THỊ · TOÀN TRANG · VÙNG CHỌN · PHẦN TỬ · KHÔNG THU THẬP DỮ LIỆU', label: 'Đỉnh bản tin' },
    zh_CN: { short: '截图与标注', tagline: '在 Chrome 中截图、标注并保存。', features: '可见区域 · 整页 · 选定区域 · 元素 · 不收集数据', label: '电子报峰值' }
};

// Marka degradesi ve ızgara: FillHub tanıtım görselleriyle aynı dil
function tileHtml({ width, height, layout }, locale) {
    const t = TEXT[locale];
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
        return `<style>${base}body{gap:52px;justify-content:flex-start;padding-inline-start:110px;box-sizing:border-box}`
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

// Tanıtım kutusu: dile göre dil ve yazı yönü (ar, ur sağdan sola) belgeye yazılır; yazı tipi seçimi buna bağlıdır
function renderTile(env, locale, layout, file, width, height) {
    return renderHtml(env.cdp, tileHtml({ width, height, layout }, locale), file,
        { width, height, lang: locale.replace('_', '-'), dir: RTL.has(locale) ? 'rtl' : 'ltr' });
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
        await wait(800);
        await editor.eval(annotateScript(await demoTargets(demo), TEXT[uiLang].label));
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

// Yalnızca ekran görüntüsü üretimi kesilirse belirli dillerle yeniden çalıştırmak için: node tools/make-store-assets.mjs ja zh_CN
async function withRetry(label, run) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await run();
        } catch (e) {
            if (attempt >= 2) throw e;
            console.log(`yeniden deneniyor (${label}): ${e.message.split('\n')[0]}`);
        }
    }
}

async function main() {
    mkdirSync(OUT, { recursive: true });
    const only = process.argv.slice(2);
    const locales = only.length ? LOCALES.filter((l) => only.includes(l)) : LOCALES;
    const env = await startEnv();
    try {
        await renderHtml(env.cdp, iconHtml(), join(OUT, 'store-icon-128.png'), { width: 128, height: 128, transparent: true });
        await renderHtml(env.cdp, tileHtml({ width: 1280, height: 640, layout: 'social' }, 'en'), join(OUT, 'social-preview-1280x640.png'), { width: 1280, height: 640 });
        console.log('simge ve sosyal önizleme: tamam');

        for (const locale of locales) {
            const dir = join(PROMO, locale);
            mkdirSync(dir, { recursive: true });
            await renderTile(env, locale, 'small', join(dir, 'promo-small-440x280.png'), 440, 280);
            await renderTile(env, locale, 'marquee', join(dir, 'promo-marquee-1400x560.png'), 1400, 560);
            console.log(`tanıtım kutuları (${locale}): tamam`);
        }
        mkdirSync(join(ROOT, 'docs', 'images'), { recursive: true });
        copyFileSync(join(PROMO, 'en', 'promo-marquee-1400x560.png'), join(ROOT, 'docs', 'images', 'banner.png'));

        for (const uiLang of locales) {
            await withRetry(uiLang, () => screenshots(env, uiLang, join(SHOTS, uiLang)));
            console.log(`ekran görüntüleri (${uiLang}): tamam`);
        }
    } finally {
        await env.close();
    }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
