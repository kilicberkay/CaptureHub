// Chrome Web Store paketi: dist/capturehub-<sürüm>.zip (harici zip aracı gerekmez, yalnızca Node).
// Kullanım: node tools/build.js
// Yalnızca extension/ altındaki çalışma zamanı dosyaları girer (zip kökü = extension/); tools/, tests/, store/,
// docs/, .github/ ve geliştirme dosyaları hariçtir. LICENSE depo kökünden eklenir.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, `capturehub-${manifest.version}.zip`);

// Beyaz liste: eklenti kökündeki dosyalar ve dizinler; LICENSE depo kökündedir
const INCLUDE_FILES = ['manifest.json'];
const ROOT_FILES = ['LICENSE'];
const INCLUDE_DIRS = ['_locales', 'scripts', 'popup', 'editor', 'options', 'shared', 'fonts', 'icons'];
const EXCLUDE = new Set();
// Zip'in tekrarlanabilir olması için sabit zaman damgası (1 Ocak 2026, DOS biçimi)
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

function collect() {
    const files = [];
    for (const f of INCLUDE_FILES) {
        if (fs.existsSync(path.join(EXT, f))) files.push(f);
    }
    for (const f of ROOT_FILES) {
        if (fs.existsSync(path.join(ROOT, f))) files.push(f);
    }
    for (const d of INCLUDE_DIRS) {
        for (const full of walk(path.join(EXT, d))) files.push(path.relative(EXT, full).split(path.sep).join('/'));
    }
    return files.filter((f) => !EXCLUDE.has(f) && !f.includes('/.'));
}

// Zip adından kaynak dosyanın yolu: LICENSE depo kökünden, geri kalanı eklenti kökünden okunur
function sourcePath(name) {
    return path.join(ROOT_FILES.includes(name) ? ROOT : EXT, name);
}

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
    const locals = [];
    const central = [];
    const localOffsets = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const comp = zlib.deflateRawSync(data, { level: 9 });
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 dosya adları
        local.writeUInt16LE(8, 8);      // deflate
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(comp.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        const rec = Buffer.concat([local, nameBuf, comp]);
        locals.push(rec);

        const cen = Buffer.alloc(46);
        cen.writeUInt32LE(0x02014b50, 0);
        cen.writeUInt16LE(20, 4);
        cen.writeUInt16LE(20, 6);
        cen.writeUInt16LE(0x0800, 8);
        cen.writeUInt16LE(8, 10);
        cen.writeUInt16LE(DOS_TIME, 12);
        cen.writeUInt16LE(DOS_DATE, 14);
        cen.writeUInt32LE(crc, 16);
        cen.writeUInt32LE(comp.length, 20);
        cen.writeUInt32LE(data.length, 24);
        cen.writeUInt16LE(nameBuf.length, 28);
        central.push(Buffer.concat([cen, nameBuf]));
        localOffsets.push(offset);
        offset += rec.length;
    }
    // Merkezi dizinde yerel başlığın konumu 42. bayttadır
    central.forEach((buf, i) => buf.writeUInt32LE(localOffsets[i], 42));
    const centralData = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralData.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...locals, centralData, eocd]);
}

function main() {
    const files = collect();
    const entries = files.map((name) => ({ name, data: fs.readFileSync(sourcePath(name)) }));

    // Doğrulama: manifest'in referans verdiği her dosya pakette olmalı
    const names = new Set(files);
    const referenced = [
        ...Object.values(manifest.icons),
        manifest.action.default_popup,
        manifest.options_page,
        manifest.background.service_worker,
    ];
    const missing = referenced.filter((f) => !names.has(f));
    if (missing.length) throw new Error(`manifest'in referans verdiği dosyalar pakette yok: ${missing.join(', ')}`);
    if (manifest.version !== pkg.version) throw new Error(`sürüm uyuşmuyor: manifest ${manifest.version}, package.json ${pkg.version}`);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const zip = buildZip(entries);
    fs.writeFileSync(OUT, zip);
    const total = entries.reduce((s, e) => s + e.data.length, 0);
    console.log(`${path.relative(ROOT, OUT)}: ${entries.length} dosya, ${total} bayt ham, ${zip.length} bayt zip`);
}

if (require.main === module) main();
module.exports = { buildZip, crc32, collect };
