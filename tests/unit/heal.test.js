// Doldurma motoru: maskelenen alan çevresinden üretilir, maske dışı değişmez, büyük alan reddedilir.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../../extension/editor/heal.js');

function image(width, height, color) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) data.set(color(i % width, Math.floor(i / width)), i * 4);
    return { data, width, height };
}

function rectMask(width, height, x0, y0, w, h) {
    const mask = new Uint8Array(width * height);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) mask[y * width + x] = 1;
    return mask;
}

const pixel = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

test('düz zemindeki leke zeminin rengiyle dolar', () => {
    const img = image(40, 30, (x, y) => (x >= 15 && x < 22 && y >= 10 && y < 16 ? [0, 0, 0, 255] : [30, 120, 200, 255]));
    const filled = H.inpaint(img, rectMask(40, 30, 14, 9, 9, 8));
    assert.equal(filled, 72);
    for (let y = 9; y < 17; y++) for (let x = 14; x < 23; x++) assert.deepEqual(pixel(img, x, y), [30, 120, 200, 255]);
});

test('yatay degradedeki delik degradeyle dolar (±3)', () => {
    const img = image(64, 32, (x) => [x * 4, 100, 255 - x * 4, 255]);
    H.inpaint(img, rectMask(64, 32, 26, 10, 12, 12));
    for (let y = 10; y < 22; y++) {
        for (let x = 26; x < 38; x++) {
            const [r, g, b] = pixel(img, x, y);
            assert.ok(Math.abs(r - x * 4) <= 3 && Math.abs(g - 100) <= 3 && Math.abs(b - (255 - x * 4)) <= 3, `${x},${y}: ${r},${g},${b}`);
        }
    }
});

test('maske dışındaki pikseller değişmez; boş maskede hiçbir şey değişmez', () => {
    const img = image(20, 20, (x, y) => [x * 10, y * 10, 50, 255]);
    const before = Uint8ClampedArray.from(img.data);
    assert.equal(H.inpaint(img, new Uint8Array(400)), 0);
    assert.deepEqual(img.data, before);
    const mask = rectMask(20, 20, 5, 5, 4, 4);
    H.inpaint(img, mask);
    for (let i = 0; i < 400; i++) {
        if (!mask[i]) assert.deepEqual(Array.from(img.data.slice(i * 4, i * 4 + 4)), Array.from(before.slice(i * 4, i * 4 + 4)));
    }
});

test('tüm görüntü maskeliyse dokunulmaz; sınırı aşan alan reddedilir', () => {
    const img = image(4, 4, () => [1, 2, 3, 255]);
    assert.equal(H.inpaint(img, new Uint8Array(16).fill(1)), 0);
    const big = { data: new Uint8ClampedArray(4), width: H.MAX_PIXELS + 1, height: 1 };
    assert.throws(() => H.inpaint(big, new Uint8Array(H.MAX_PIXELS + 1).fill(1)), /healTooLarge/);
});

// Dikey çizgili desen (6 piksel aralıklı) ve gürültülü doku: ortadaki delik doğru deseni geri getirmeli
const stripes = (x) => (Math.floor(x / 3) % 2 ? [240, 240, 240, 255] : [20, 20, 20, 255]);

function meanError(img, truth, mask) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        for (let c = 0; c < 3; c++) sum += Math.abs(img.data[i * 4 + c] - truth.data[i * 4 + c]);
        n += 3;
    }
    return sum / n;
}

test('doku seçimi: çizgili ve gürültülü çevre dokulu; düz zemin ve degrade değil', () => {
    const mask = rectMask(96, 64, 38, 22, 20, 20);
    assert.equal(H.isTextured(image(96, 64, stripes), mask), true);
    assert.equal(H.isTextured(image(96, 64, (x, y) => [(x * 37 + y * 91) % 256, (x * 53) % 256, (y * 29) % 256, 255]), mask), true);
    assert.equal(H.isTextured(image(96, 64, () => [200, 210, 220, 255]), mask), false);
    assert.equal(H.isTextured(image(96, 64, (x) => [x * 2, 100, 255 - x * 2, 255]), mask), false);
});

test('dokulu delik: örnek tabanlı doldurma deseni sürdürür, yayılmadan çok daha az hata verir; sonuç belirlenimci', () => {
    const truth = image(96, 64, stripes);
    const mask = rectMask(96, 64, 38, 22, 20, 20);
    const holed = () => image(96, 64, (x, y) => (x >= 38 && x < 58 && y >= 22 && y < 42 ? [255, 0, 0, 255] : stripes(x)));
    const texture = holed();
    H.inpaint(texture, mask, 'texture');
    const diffuse = holed();
    H.inpaint(diffuse, mask, 'diffuse');
    const textureError = meanError(texture, truth, mask);
    const diffuseError = meanError(diffuse, truth, mask);
    assert.ok(textureError < 15, `doku hatası ${textureError.toFixed(1)}`);
    assert.ok(textureError * 4 < diffuseError, `doku ${textureError.toFixed(1)} / yayılma ${diffuseError.toFixed(1)}`);
    const again = holed();
    H.inpaint(again, mask, 'auto');
    assert.deepEqual(again.data, texture.data, 'auto dokuyu seçer ve aynı sonucu verir');
});
