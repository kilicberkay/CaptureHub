// Yakalama deposu (IndexedDB). Servis çalışanı ve düzenleyici aynı veritabanını kullanır.
// Meta ve görüntü ayrı mağazalarda tutulur; geçmiş listesi görüntüleri okumadan açılır.
// Eski yakalamalar ayarlardaki sınıra kadar tutulur; disk ve bellek sınırsız büyümez. settings.js önce yüklenmelidir.
var CaptureStore = (() => {
    const DB_NAME = 'capturehub';
    let dbPromise = null;

    function open() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore('meta', { keyPath: 'id', autoIncrement: true });
                    request.result.createObjectStore('blobs');
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

    // Meta ve görüntü aynı işlemde yazılır: biri yazılıp diğeri yazılmadan kalmaz
    async function save(blob, meta) {
        const db = await open();
        const tx = db.transaction(['meta', 'blobs'], 'readwrite');
        const add = tx.objectStore('meta').add({ ...meta, createdAt: Date.now() });
        add.onsuccess = () => tx.objectStore('blobs').put(blob, add.result);
        await done(tx);
        await trim();
        return add.result;
    }

    async function get(id) {
        const db = await open();
        return request(db.transaction('blobs').objectStore('blobs').get(id));
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
        const tx = db.transaction(['meta', 'blobs'], 'readwrite');
        for (const row of stale) {
            tx.objectStore('meta').delete(row.id);
            tx.objectStore('blobs').delete(row.id);
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
        const tx = db.transaction(['meta', 'blobs'], 'readwrite');
        tx.objectStore('meta').delete(id);
        tx.objectStore('blobs').delete(id);
        await done(tx);
    }

    async function clear() {
        const db = await open();
        const tx = db.transaction(['meta', 'blobs'], 'readwrite');
        tx.objectStore('meta').clear();
        tx.objectStore('blobs').clear();
        await done(tx);
    }

    return { save, get, list, update, trim, remove, clear };
})();

if (typeof module !== 'undefined') module.exports = CaptureStore;
