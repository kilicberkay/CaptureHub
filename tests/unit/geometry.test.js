const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../extension/scripts/geometry.js');

test('normalizeRect: sürükleme yönünden bağımsız pozitif dikdörtgen', () => {
    assert.deepEqual(G.normalizeRect(10, 20, 4, 8), { x: 4, y: 8, width: 6, height: 12 });
    assert.deepEqual(G.normalizeRect(4, 8, 10, 20), { x: 4, y: 8, width: 6, height: 12 });
});

test('clampRect: görünür alan dışına taşan seçimi kırpar', () => {
    assert.deepEqual(G.clampRect({ x: -10, y: 90, width: 50, height: 50 }, 100, 120), { x: 0, y: 90, width: 40, height: 30 });
    assert.deepEqual(G.clampRect({ x: 200, y: 0, width: 10, height: 10 }, 100, 100), { x: 100, y: 0, width: 0, height: 10 });
});

test('scaleRect: CSS pikselini cihaz pikseline çevirir ve yuvarlar', () => {
    assert.deepEqual(G.scaleRect({ x: 10, y: 5, width: 100, height: 50 }, 2), { x: 20, y: 10, width: 200, height: 100 });
    assert.deepEqual(G.scaleRect({ x: 1, y: 1, width: 3, height: 3 }, 1.5), { x: 2, y: 2, width: 5, height: 5 });
});

test('planSlices: sayfa görünümden kısaysa tek dilim', () => {
    assert.deepEqual(G.planSlices(800, 900), [0]);
    assert.deepEqual(G.planSlices(900, 900), [0]);
});

test('planSlices: son dilim sayfa sonuna hizalanır ve hiçbir piksel atlanmaz', () => {
    const offsets = G.planSlices(2500, 1000);
    assert.deepEqual(offsets, [0, 1000, 1500]);
    // Her dilim [y, y + görünüm) aralığını kapsar; birleşimi tüm sayfayı örtmeli
    const covered = new Set();
    for (const y of offsets) for (let i = y; i < y + 1000; i++) covered.add(i);
    for (let i = 0; i < 2500; i++) assert.ok(covered.has(i), `piksel ${i} yakalanmadı`);
});

test('fixedShown: üst sabit öğe yalnız ilk, alt sabit öğe yalnız son dilimde görünür', () => {
    // 3 dilim, görünüm 1000 px
    assert.equal(G.fixedShown(0, 3, 40, 1000), true, 'üst başlık ilk dilimde');
    assert.equal(G.fixedShown(1, 3, 40, 1000), false, 'üst başlık ortadaki dilimde gizlenir');
    assert.equal(G.fixedShown(2, 3, 960, 1000), true, 'alt bar son dilimde');
    assert.equal(G.fixedShown(0, 3, 960, 1000), false, 'alt bar ilk dilimde gizlenir');
});

test('fixedShown: ortadaki sabit öğe her dilimde gizlenir; tek dilimde her zaman görünür', () => {
    for (let i = 0; i < 3; i++) assert.equal(G.fixedShown(i, 3, 500, 1000), false);
    assert.equal(G.fixedShown(0, 1, 500, 1000), true);
});
