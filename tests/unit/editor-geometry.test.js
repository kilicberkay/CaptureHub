const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../extension/scripts/geometry.js');

const rect = { type: 'rect', x1: 10, y1: 10, x2: 50, y2: 30 };
const arrow = { type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0 };
const text = { type: 'text', x1: 200, y1: 200, w: 60, h: 20 };
const number = { type: 'number', x1: 300, y1: 300, r: 10 };

test('itemBounds: kutu normalize edilir; metin ve numara boyutlarından hesaplanır', () => {
    assert.deepEqual(G.itemBounds({ type: 'rect', x1: 50, y1: 30, x2: 10, y2: 10 }), { x: 10, y: 10, width: 40, height: 20 });
    assert.deepEqual(G.itemBounds(text), { x: 200, y: 200, width: 60, height: 20 });
    assert.deepEqual(G.itemBounds(number), { x: 290, y: 290, width: 20, height: 20 });
});

test('hitItem: üstteki öğe önce bulunur, boş alan -1 döner', () => {
    const items = [rect, text];
    assert.equal(G.hitItem(items, { x: 20, y: 20 }, 2), 0);
    assert.equal(G.hitItem([rect, { ...rect, x1: 15, y1: 15 }], { x: 20, y: 20 }, 2), 1, 'son öğe üstte');
    assert.equal(G.hitItem(items, { x: 500, y: 500 }, 2), -1);
});

test('hitItem: ok yalnız çizgisine yakınken yakalanır', () => {
    assert.equal(G.hitItem([arrow], { x: 50, y: 1 }, 3), 0);
    assert.equal(G.hitItem([arrow], { x: 50, y: 10 }, 3), -1);
});

test('hitItem: tolerans kenardaki tıklamayı kabul eder', () => {
    assert.equal(G.hitItem([rect], { x: 53, y: 20 }, 4), 0);
    assert.equal(G.hitItem([rect], { x: 53, y: 20 }, 2), -1);
});

test('handlesOf: kutu ve ok iki uç verir; metin ve numara tutamaç vermez', () => {
    assert.deepEqual(G.handlesOf(rect), [{ key: 'a', x: 10, y: 10 }, { key: 'b', x: 50, y: 30 }]);
    assert.deepEqual(G.handlesOf(text), []);
    assert.deepEqual(G.handlesOf(number), []);
});

test('translateItem ve moveHandle yeni nesne döndürür, girdiyi değiştirmez', () => {
    const moved = G.translateItem(rect, 5, -5);
    assert.deepEqual([moved.x1, moved.y1, moved.x2, moved.y2], [15, 5, 55, 25]);
    assert.deepEqual([rect.x1, rect.y1], [10, 10]);
    const resized = G.moveHandle(rect, 'b', { x: 80, y: 90 });
    assert.deepEqual([resized.x2, resized.y2, resized.x1], [80, 90, 10]);
    const text2 = G.translateItem(text, 1, 1);
    assert.equal(text2.x2, undefined, 'metin öğesinde x2 eklenmez');
});

test('nextNumber: en büyük numaranın bir fazlası; silinen numaralar yeniden kullanılmaz', () => {
    assert.equal(G.nextNumber([]), 1);
    assert.equal(G.nextNumber([rect, { type: 'number', n: 1 }, { type: 'number', n: 2 }]), 3);
    assert.equal(G.nextNumber([{ type: 'number', n: 1 }, { type: 'number', n: 3 }]), 4);
});

test('fileName: şablondaki yer tutucuları doldurur, geçersiz karakterleri temizler', () => {
    const date = new Date(2026, 9, 24, 14, 30, 5);
    assert.equal(G.fileName('', 'region', date, 'png'), 'capturehub-2026-10-24_14-30-05-region.png');
    assert.equal(G.fileName('{mod}/{tarih}', 'full', date, 'jpg'), 'full-2026-10-24_14-30-05.jpg');
    assert.equal(G.fileName('   ', 'visible', date, 'webp'), 'capturehub-2026-10-24_14-30-05-visible.webp');
    assert.equal(G.fileName('shot-{date}-{mode}', 'element', date, 'png'), 'shot-2026-10-24_14-30-05-element.png');
    assert.equal(G.fileName('{tarih}-{mod}', 'full', date, 'png'), '2026-10-24_14-30-05-full.png');
});

test('siteName: yalnız http(s) adresinden alan adı; diğer şemalar ve bozuk adres boş', () => {
    assert.equal(G.siteName('https://www.example.com/a?b=1'), 'www.example.com');
    assert.equal(G.siteName('http://localhost:8080/'), 'localhost');
    assert.equal(G.siteName('javascript:alert(1)'), '');
    assert.equal(G.siteName('file:///home/a.html'), '');
    assert.equal(G.siteName('bozuk'), '');
    assert.equal(G.siteName(undefined), '');
});

test('dimensions: boyut soldan sağa yalıtılır (Arapça/Urduca arayüzde ters dönmez)', () => {
    assert.equal(G.dimensions(1280, 713), '⁦1280×713⁩');
});

const pen = { type: 'pen', points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }] };

test('kalem: sınır kutusu, çizgiye yakın isabet, boş iç seçilmez, taşıma tüm noktaları kaydırır', () => {
    assert.deepEqual(G.itemBounds(pen), { x: 10, y: 10, width: 40, height: 30 });
    assert.equal(G.hitItem([pen], { x: 30, y: 12 }, 4), 0);
    assert.equal(G.hitItem([pen], { x: 20, y: 30 }, 4), -1);
    assert.deepEqual(G.translateItem(pen, 5, -5).points, [{ x: 15, y: 5 }, { x: 55, y: 5 }, { x: 55, y: 35 }]);
    assert.deepEqual(G.handlesOf(pen), []);
});

test('elips: kutu gibi sınır kutusu ve iki uç tutamacı', () => {
    const ellipse = { type: 'ellipse', x1: 100, y1: 50, x2: 20, y2: 10 };
    assert.deepEqual(G.itemBounds(ellipse), { x: 20, y: 10, width: 80, height: 40 });
    assert.equal(G.hitItem([ellipse], { x: 60, y: 30 }, 2), 0);
    assert.equal(G.handlesOf(ellipse).length, 2);
});

test('rotateItem: (x, y) → (H − y, x); dört kez döndürmek özgün konumu verir; metin yatay kalır', () => {
    const W = 200;
    const H = 100;
    const box = { type: 'rect', x1: 10, y1: 20, x2: 60, y2: 70 };
    assert.deepEqual(G.rotateItem(box, H), { type: 'rect', x1: 80, y1: 10, x2: 30, y2: 60 });
    const text = { type: 'text', x1: 10, y1: 20, w: 40, h: 10 };
    const turned = G.rotateItem(text, H);
    assert.deepEqual([turned.w, turned.h], [40, 10]);
    assert.deepEqual([turned.x1 + 20, turned.y1 + 5], [H - 25, 30], 'merkez döner');
    // Her turda yükseklik genişlikle yer değiştirir
    const dims = [H, W, H, W];
    let item = { ...pen };
    for (const h of dims) item = G.rotateItem(item, h);
    assert.deepEqual(item.points, pen.points);
});

test('scaleItem: koordinatlar ve saklanan ölçüler ölçeklenir', () => {
    assert.deepEqual(G.scaleItem({ type: 'number', x1: 10, y1: 20, r: 8, n: 3 }, 0.5), { type: 'number', x1: 5, y1: 10, r: 4, n: 3 });
    assert.deepEqual(G.scaleItem(pen, 2).points[1], { x: 100, y: 20 });
    assert.deepEqual(G.scaleItem({ type: 'text', x1: 4, y1: 4, px: 20, w: 40, h: 25, text: 'a' }, 0.5), { type: 'text', x1: 2, y1: 2, px: 10, w: 20, h: 12.5, text: 'a' });
});

test('fileName: {site} ve {title}; geçersiz karakter, boş parça ve uzun başlık temizlenir', () => {
    const date = new Date(2026, 9, 24, 14, 30, 5);
    const source = { site: 'www.example.com', title: 'Rapor: Q3 / "Satış" <özet>' };
    assert.equal(G.fileName('{site}-{title}', 'full', date, 'png', source), 'www.example.com-Rapor- Q3 - -Satış- -özet.png');
    assert.equal(G.fileName('{site}-{mode}', 'visible', date, 'png', {}), 'visible.png', 'boş site tireyi bırakmaz');
    assert.equal(G.fileName('{title}', 'visible', date, 'png', { title: 'x'.repeat(100) }), `${'x'.repeat(60)}.png`);
    assert.equal(G.fileName('{title}', 'visible', date, 'png', {}), 'capturehub.png', 'tamamen boşsa varsayılan ad');
});

test('planRange: aralığı kaplayan ofsetler; sayfa sonunu aşmaz', () => {
    assert.deepEqual(G.planRange(1000, 1500, 700, 3000), [1000, 1700, 1800]);
    assert.deepEqual(G.planRange(0, 500, 700, 3000), [0]);
    assert.deepEqual(G.planRange(2600, 1000, 700, 3000), [2300], 'sayfa sonunda tek dilim');
});

test('maxCanvasHeight: dar sayfada 32000, geniş görüntüde alan sınırı', () => {
    assert.equal(G.maxCanvasHeight(1280), 32000);
    assert.equal(G.maxCanvasHeight(10000), 20000);
});
