// Ayarlar: varsayılanlar, izinli değerler ve yedek dosyası. Tarayıcıda global CaptureSettings, Node'da module.exports.
// İçe aktarılan dosya dışarıdan gelir; yalnız bilinen anahtarlar okunur ve her değer burada doğrulanır.
var CaptureSettings = (() => {
    const FORMAT = 'capturehub-settings';
    const VERSION = 1;
    const MAX_BYTES = 20000;
    const DEFAULTS = {
        theme: 'dark', uiLang: 'auto', format: 'png', quality: 0.92, nameTemplate: '', delay: 0, historyLimit: 30,
        editorColor: '#f74a87', editorSize: 'm'
    };
    const DELAYS = [0, 3, 5, 10];
    const HISTORY_LIMITS = [10, 30, 100];
    const SIZES = ['xs', 's', 'm', 'l', 'xl'];
    const VALID = {
        theme: (v) => ['system', 'dark', 'light'].includes(v),
        // Bilinmeyen dil kodu zararsızdır: CaptureI18n onu İngilizceye düşürür
        uiLang: (v) => typeof v === 'string' && /^(auto|[a-z]{2}(_[A-Z]{2})?)$/.test(v),
        format: (v) => ['png', 'jpeg', 'webp'].includes(v),
        quality: (v) => typeof v === 'number' && v >= 0.5 && v <= 1,
        nameTemplate: (v) => typeof v === 'string' && v.length <= 120,
        delay: (v) => DELAYS.includes(v),
        historyLimit: (v) => HISTORY_LIMITS.includes(v),
        editorColor: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
        editorSize: (v) => SIZES.includes(v)
    };
    const KEYS = Object.keys(DEFAULTS);

    function createBackup(values, now = new Date()) {
        const settings = {};
        for (const key of KEYS) settings[key] = VALID[key](values[key]) ? values[key] : DEFAULTS[key];
        return { format: FORMAT, version: VERSION, exportedAt: now.toISOString(), settings };
    }

    // Hata iletisi bir çeviri anahtarıdır (backupTooLarge, backupInvalid)
    function parseBackup(text) {
        if (typeof text !== 'string' || text.length > MAX_BYTES) throw new Error('backupTooLarge');
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error('backupInvalid');
        }
        const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
        if (!isObject(data) || data.format !== FORMAT || data.version !== VERSION || !isObject(data.settings)) {
            throw new Error('backupInvalid');
        }
        const result = {};
        for (const key of KEYS) {
            if (!Object.prototype.hasOwnProperty.call(data.settings, key)) continue;
            if (!VALID[key](data.settings[key])) throw new Error('backupInvalid');
            result[key] = data.settings[key];
        }
        return result;
    }

    return { DEFAULTS, DELAYS, HISTORY_LIMITS, SIZES, KEYS, createBackup, parseBackup };
})();

if (typeof module !== 'undefined') module.exports = CaptureSettings;
