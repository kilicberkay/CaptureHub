// Çeviri tabloları: 15 dilin anahtar kümesi aynı, değerler boş değil, yer tutucular İngilizceyle aynı;
// _locales dosyaları aynı dilleri kapsar ve manifest anahtarlarını içerir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I18N = require('../../extension/shared/i18n.js');

const EXT = path.join(__dirname, '..', '..', 'extension');
const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort();

test('i18n: 15 dil tanımlı', () => {
    assert.equal(I18N.languages.length, 15);
});

test('i18n: her dilde İngilizceyle aynı anahtarlar, boş değer yok, yer tutucular eşleşir', () => {
    const reference = I18N.table.en;
    for (const lang of I18N.languages) {
        const table = I18N.table[lang];
        assert.deepEqual(Object.keys(table).sort(), Object.keys(reference).sort(), `${lang}: anahtar kümesi`);
        for (const [key, value] of Object.entries(table)) {
            assert.ok(value.trim(), `${lang}.${key} boş`);
            assert.deepEqual(placeholders(value), placeholders(reference[key]), `${lang}.${key} yer tutucu`);
        }
    }
});

test('i18n: dil çözümleme bölgeli kodu tabloyla eşler, bilinmeyeni İngilizceye düşürür', () => {
    assert.equal(I18N.resolve('pt-BR'), 'pt_BR');
    assert.equal(I18N.resolve('zh-CN'), 'zh_CN');
    assert.equal(I18N.resolve('pt'), 'pt_BR');
    assert.equal(I18N.resolve('xx'), 'en');
    assert.equal(I18N.resolve('auto'), 'en');
});

test('_locales: 15 klasör, her biri manifest, komut ve sağ tık menüsü başlıklarını içerir; extDescription ≤132', () => {
    const dirs = fs.readdirSync(path.join(EXT, '_locales')).sort();
    assert.deepEqual(dirs, [...I18N.languages].sort());
    for (const dir of dirs) {
        const messages = JSON.parse(fs.readFileSync(path.join(EXT, '_locales', dir, 'messages.json'), 'utf8'));
        for (const key of ['extName', 'extDescription', 'actionTitle', 'cmdVisible', 'cmdFull', 'cmdRegion', 'cmdElement', 'menuHistory', 'menuSettings', 'errRestricted', 'errTabChanged', 'captureFailed']) {
            assert.ok(messages[key] && messages[key].message.trim(), `${dir}: ${key} eksik`);
        }
        assert.ok(messages.extDescription.message.length <= 132, `${dir}: extDescription çok uzun`);
    }
});
