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
