// Tüm denetimleri sırayla çalıştırır: sözdizimi, veri doğrulaması, birim testleri ve (Chromium varsa) uçtan uca.
// Kullanım: node tools/run-tests.js            (e2e Chromium yoksa atlanır)
//           node tools/run-tests.js --no-e2e   (yalnızca hızlı denetimler)
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const runE2E = !args.includes('--no-e2e');

const steps = [
    { name: 'sözdizimi', cmd: [process.execPath, [path.join(ROOT, 'tools/check-syntax.js')]] },
    { name: 'birim testleri', cmd: [process.execPath, ['--test', path.join(ROOT, 'tests/unit', '*.test.js')]] },
];
if (runE2E) {
    steps.push({ name: 'uçtan uca (Chromium)', cmd: [process.execPath, ['--test', '--test-timeout=400000', path.join(ROOT, 'tests', 'e2e', '*.test.mjs')]] });
}

let failed = 0;
for (const step of steps) {
    console.log(`\n== ${step.name}`);
    const res = spawnSync(step.cmd[0], step.cmd[1], { cwd: ROOT, stdio: 'inherit' });
    if (res.status !== 0) {
        failed++;
        console.log(`== ${step.name}: BAŞARISIZ (çıkış ${res.status})`);
    } else {
        console.log(`== ${step.name}: tamam`);
    }
}
console.log(failed ? `\n${failed} adım başarısız` : '\nTüm adımlar geçti');
process.exit(failed ? 1 : 0);
