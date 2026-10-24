// Repo içindeki tüm JavaScript dosyalarında sözdizimi denetimi (node --check).
// Kullanım: node tools/check-syntax.js   — hata varsa çıkış kodu 1.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'store', 'dist']);

function collect(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full, out);
        else if (/\.(c|m)?js$/.test(entry.name)) out.push(full);
    }
    return out;
}

const files = collect(ROOT).sort();
let failed = 0;
for (const file of files) {
    const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (res.status !== 0) {
        failed++;
        console.log(`HATA ${path.relative(ROOT, file)}\n${res.stderr}`);
    }
}
console.log(`Sözdizimi: ${files.length} dosya denetlendi, ${failed} hatalı`);
process.exit(failed ? 1 : 0);
