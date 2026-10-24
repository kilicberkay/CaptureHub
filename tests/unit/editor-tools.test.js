// Düzenleyici çizim yardımcıları: boyut ölçekleri ve renk parlaklığına göre yazı rengi seçimi.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../extension/editor/tools.js');
const S = require('../../extension/shared/settings.js');

test('boyutlar: XS..XL artan sırada; ayarlardaki boyut listesiyle aynı', () => {
    assert.deepEqual(Object.keys(T.SIZE_FACTOR), S.SIZES);
    const strokes = S.SIZES.map((size) => T.strokeFor(4000, size));
    for (let i = 1; i < strokes.length; i++) assert.ok(strokes[i] > strokes[i - 1], `${S.SIZES[i]} > ${S.SIZES[i - 1]}`);
});

test('isLightColor: sarı, yeşil, beyaz açık; pembe, kırmızı, mavi, siyah koyu', () => {
    for (const color of ['#f59e0b', '#10b981', '#ffffff', '#FFFF00']) assert.equal(T.isLightColor(color), true, color);
    for (const color of ['#f74a87', '#ef4444', '#3b82f6', '#18181b', '#000000']) assert.equal(T.isLightColor(color), false, color);
});
