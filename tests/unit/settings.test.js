// Ayar yedeği: üretilen dosya geri okunabilir; dışarıdan gelen bozuk ya da kötü niyetli dosya reddedilir.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../extension/shared/settings.js');

const backup = (settings) => JSON.stringify({ format: 'capturehub-settings', version: 1, settings });

test('createBackup → parseBackup aynı değerleri döndürür', () => {
    const values = { ...S.DEFAULTS, theme: 'system', format: 'webp', quality: 0.8, delay: 5, historyLimit: 100, editorColor: '#123abc', editorSize: 'xl' };
    const file = S.createBackup(values, new Date('2026-10-24T10:00:00Z'));
    assert.equal(file.exportedAt, '2026-10-24T10:00:00.000Z');
    assert.deepEqual(S.parseBackup(JSON.stringify(file)), values);
});

test('createBackup: geçersiz ya da eksik değer yerine varsayılan yazılır, fazla anahtar alınmaz', () => {
    const file = S.createBackup({ theme: 'mor', delay: 7, secret: 'x' });
    assert.deepEqual(file.settings, S.DEFAULTS);
});

test('parseBackup: bilinmeyen ve prototip anahtarları yok sayılır, eksik anahtarlar dokunulmaz', () => {
    const text = '{"format":"capturehub-settings","version":1,"settings":{"theme":"light","__proto__":{"polluted":1},"extra":1}}';
    const result = S.parseBackup(text);
    assert.deepEqual(result, { theme: 'light' });
    assert.equal({}.polluted, undefined);
});

test('parseBackup: bozuk, yanlış biçimli ya da geçersiz değerli dosya reddedilir', () => {
    const invalid = [
        'not json',
        '[]',
        'null',
        JSON.stringify({ format: 'other', version: 1, settings: {} }),
        JSON.stringify({ format: 'capturehub-settings', version: 2, settings: {} }),
        JSON.stringify({ format: 'capturehub-settings', version: 1, settings: [] }),
        backup({ theme: 'mor' }),
        backup({ quality: 2 }),
        backup({ quality: '0.9' }),
        backup({ delay: 7 }),
        backup({ historyLimit: 1e9 }),
        backup({ editorColor: 'red' }),
        backup({ editorSize: 'xxl' }),
        backup({ nameTemplate: 'x'.repeat(121) }),
        backup({ uiLang: '<script>' })
    ];
    for (const text of invalid) assert.throws(() => S.parseBackup(text), /backupInvalid/, text);
});

test('parseBackup: çok büyük dosya okunmadan reddedilir', () => {
    assert.throws(() => S.parseBackup(' '.repeat(20001)), /backupTooLarge/);
});
