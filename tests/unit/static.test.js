// Manifest ve HTML sayfalarındaki yolların diskte var olduğunu denetler; kırık yol sessizce yakalama hatasına dönüşür.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXT = path.join(__dirname, '..', '..', 'extension');

function exists(relative) {
    return fs.existsSync(path.join(EXT, relative));
}

function references(html) {
    const found = [];
    for (const match of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
        if (!/^(https?:|data:|chrome-extension:)/.test(match[1])) found.push(match[1]);
    }
    return found;
}

test('manifest: tanımlanan tüm dosyalar mevcut', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
    const paths = [
        manifest.action.default_popup,
        manifest.options_page,
        manifest.background.service_worker,
        ...Object.values(manifest.icons),
        ...Object.values(manifest.action.default_icon)
    ];
    for (const p of paths) assert.ok(exists(p), `eksik dosya: ${p}`);
});

test('HTML: script ve stil bağlantıları mevcut dosyalara gider', () => {
    for (const page of ['popup/popup.html', 'editor/editor.html', 'options/options.html']) {
        const html = fs.readFileSync(path.join(EXT, page), 'utf8');
        const base = path.dirname(page);
        for (const ref of references(html)) {
            assert.ok(exists(path.join(base, ref)), `${page}: eksik ${ref}`);
        }
    }
});

test('CSS: yazı tipi dosyaları mevcut', () => {
    const css = fs.readFileSync(path.join(EXT, 'shared/ui.css'), 'utf8');
    for (const match of css.matchAll(/url\('([^']+)'\)/g)) {
        assert.ok(exists(path.join('shared', match[1])), `eksik yazı tipi: ${match[1]}`);
    }
});

test('gizlilik: uzantı kodunda ağ çağrısı yok; yalnız veri URL\'si okuyan fetch kullanılır', () => {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(c|m)?js$/.test(entry.name)) files.push(full);
        }
    };
    walk(EXT);
    const offenders = [];
    for (const file of files) {
        const code = fs.readFileSync(file, 'utf8');
        if (/XMLHttpRequest|WebSocket|navigator\.sendBeacon|EventSource/.test(code)) offenders.push(path.relative(EXT, file));
        for (const match of code.matchAll(/fetch\(([^)]*)\)/g)) {
            if (match[1] !== 'dataUrl') offenders.push(`${path.relative(EXT, file)}: fetch(${match[1]})`);
        }
    }
    assert.deepEqual(offenders, []);
});

test('manifest: dört yakalama komutu Alt+Shift ile; FillHub kısayolları (Ctrl+Shift+F/Y/U) kullanılmaz', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
    const keys = Object.fromEntries(Object.entries(manifest.commands).map(([name, c]) => [name, c.suggested_key.default]));
    assert.deepEqual(keys, {
        capture_visible: 'Alt+Shift+V', capture_full: 'Alt+Shift+F', capture_region: 'Alt+Shift+R', capture_element: 'Alt+Shift+E'
    });
    assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'contextMenus', 'downloads', 'scripting', 'storage']);
    assert.equal(manifest.host_permissions, undefined, 'host izni yok');
});
