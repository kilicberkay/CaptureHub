// Yakalama deposu (IndexedDB). Servis çalışanı ve düzenleyici aynı veritabanını kullanır.
// Mağazalar: meta (liste), blobs (özgün görüntü), thumbs (küçük resim), edits (düzenleyicide kaydedilen işaretler ve
// değişmiş taban görüntü). Geçmiş listesi görüntüleri okumadan açılır; özgün görüntü düzenlemeyle değişmez.
// Eski yakalamalar ayarlardaki sınıra kadar tutulur; disk ve bellek sınırsız büyümez. settings.js önce yüklenmelidir.
var CaptureStore = (() => {
    const DB_NAME = 'capturehub';
    const STORES = ['meta', 'blobs', 'thumbs', 'edits'];
    // Küçük resim: en fazla 320×200; uzun görüntülerde üst kısım gösterilir
    const THUMB_WIDTH = 320;
    const THUMB_HEIGHT = 200;
    let dbPromise = null;

    function open() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                // Sürüm 2: thumbs ve edits eklendi. Eksik mağaza açılır, var olan veri korunur.
                const request = indexedDB.open(DB_NAME, 2);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    for (const name of STORES) {
                        if (db.objectStoreNames.contains(name)) continue;
                        if (name === 'meta') db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
                        else db.createObjectStore(name);
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        return dbPromise;
    }

    function request(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function done(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    // Görüntüden küçük resim (JPEG). Kaynak blob, ImageBitmap ya da tuval olabilir.
    async function makeThumb(source) {
        const bitmap = await createImageBitmap(source);
        const k = Math.min(1, THUMB_WIDTH / bitmap.width);
        const width = Math.max(1, Math.round(bitmap.width * k));
        const height = Math.max(1, Math.min(THUMB_HEIGHT, Math.round(bitmap.height * k)));
        const canvas = new OffscreenCanvas(width, height);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, width, bitmap.height * k);
        bitmap.close();
        return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    }

    // Meta, görüntü ve küçük resim aynı işlemde yazılır: biri yazılıp diğeri yazılmadan kalmaz.
    // Küçük resim üretilemezse yakalama yine kaydedilir (küçük resim isteğe bağlıdır, görüntü değildir).
    async function save(blob, meta) {
        const thumb = await makeThumb(blob).catch(() => null);
        const db = await open();
        const tx = db.transaction(['meta', 'blobs', 'thumbs'], 'readwrite');
        const add = tx.objectStore('meta').add({ ...meta, createdAt: Date.now() });
        add.onsuccess = () => {
            tx.objectStore('blobs').put(blob, add.result);
            if (thumb) tx.objectStore('thumbs').put(thumb, add.result);
        };
        await done(tx);
        await trim();
        return add.result;
    }

    async function get(id) {
        const db = await open();
        return request(db.transaction('blobs').objectStore('blobs').get(id));
    }

    // Küçük resim; 1.2.0 öncesi kayıtlarda yoksa (düzenlenmiş taban ya da özgün görüntüden) üretilip saklanır
    async function getThumb(id) {
        const db = await open();
        const thumb = await request(db.transaction('thumbs').objectStore('thumbs').get(id));
        if (thumb) return thumb;
        const edits = await getEdits(id);
        const source = (edits && edits.base) || await get(id);
        if (!source) return null;
        const made = await makeThumb(source).catch(() => null);
        if (!made) return null;
        const tx = db.transaction('thumbs', 'readwrite');
        tx.objectStore('thumbs').put(made, id);
        await done(tx);
        return made;
    }

    async function getEdits(id) {
        const db = await open();
        return request(db.transaction('edits').objectStore('edits').get(id));
    }

    // Düzenleyicinin otomatik kaydı: { items, base } (base yalnız taban görüntü değiştiyse PNG blob) ve güncel küçük resim
    async function saveEdits(id, edits, thumb) {
        const db = await open();
        const tx = db.transaction(['edits', 'thumbs'], 'readwrite');
        tx.objectStore('edits').put(edits, id);
        if (thumb) tx.objectStore('thumbs').put(thumb, id);
        await done(tx);
    }

    // Orijinale dön: düzenleme silinir, küçük resim özgün görüntüden yeniden üretilir
    async function clearEdits(id) {
        const original = await get(id);
        const thumb = original ? await makeThumb(original).catch(() => null) : null;
        const db = await open();
        const tx = db.transaction(['edits', 'thumbs'], 'readwrite');
        tx.objectStore('edits').delete(id);
        if (thumb) tx.objectStore('thumbs').put(thumb, id);
        await done(tx);
    }

    // En yeni başta
    async function list() {
        const db = await open();
        const rows = await request(db.transaction('meta').objectStore('meta').getAll());
        return rows.reverse();
    }

    async function trim() {
        const { historyLimit } = await chrome.storage.local.get({ historyLimit: CaptureSettings.DEFAULTS.historyLimit });
        const stale = (await list()).slice(historyLimit);
        if (stale.length === 0) return;
        const db = await open();
        const tx = db.transaction(STORES, 'readwrite');
        for (const row of stale) {
            for (const name of STORES) tx.objectStore(name).delete(row.id);
        }
        await done(tx);
    }

    // Meta kaydına alan ekler (örn. indirme kimliği); kayıt silinmişse bir şey yapmaz
    async function update(id, patch) {
        const db = await open();
        const tx = db.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');
        const read = store.get(id);
        read.onsuccess = () => {
            if (read.result) store.put({ ...read.result, ...patch });
        };
        await done(tx);
    }

    async function remove(id) {
        const db = await open();
        const tx = db.transaction(STORES, 'readwrite');
        for (const name of STORES) tx.objectStore(name).delete(id);
        await done(tx);
    }

    async function clear() {
        const db = await open();
        const tx = db.transaction(STORES, 'readwrite');
        for (const name of STORES) tx.objectStore(name).clear();
        await done(tx);
    }

    return { save, get, list, update, trim, remove, clear, makeThumb, getThumb, getEdits, saveEdits, clearEdits };
})();

if (typeof module !== 'undefined') module.exports = CaptureStore;
