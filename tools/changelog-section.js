// CHANGELOG.md'den bir sürümün bölümünü yazdırır (yayın notu olarak kullanılır).
// Kullanım: node tools/changelog-section.js 1.2.0   — bölüm yoksa çıkış kodu 1 döner.
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
    console.error('kullanım: node tools/changelog-section.js <sürüm>');
    process.exit(2);
}
const lines = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8').split('\n');
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start < 0) {
    console.error(`CHANGELOG.md içinde ${version} bölümü yok`);
    process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
if (end < 0) end = lines.length;
process.stdout.write(lines.slice(start + 1, end).join('\n').trim() + '\n');
