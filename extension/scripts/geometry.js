// Ekran görüntüsü geometri yardımcıları. Tarayıcıda global, Node'da module.exports (birim testleri).
var CaptureGeometry = (() => {
    // İki köşeden dikdörtgen; sürükleme yönü ne olursa olsun pozitif genişlik ve yükseklik döner
    function normalizeRect(x1, y1, x2, y2) {
        return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    }

    // Dikdörtgeni [0, maxWidth] x [0, maxHeight] içine kırpar
    function clampRect(rect, maxWidth, maxHeight) {
        const x = Math.max(0, Math.min(rect.x, maxWidth));
        const y = Math.max(0, Math.min(rect.y, maxHeight));
        const right = Math.max(x, Math.min(rect.x + rect.width, maxWidth));
        const bottom = Math.max(y, Math.min(rect.y + rect.height, maxHeight));
        return { x, y, width: right - x, height: bottom - y };
    }

    // CSS pikselinden cihaz pikseline çevirir (ekran görüntüsü cihaz pikseli döndürür)
    function scaleRect(rect, scale) {
        return {
            x: Math.round(rect.x * scale),
            y: Math.round(rect.y * scale),
            width: Math.round(rect.width * scale),
            height: Math.round(rect.height * scale)
        };
    }

    // Tam sayfa için kaydırma konumları. Son konum sayfanın sonuna hizalanır; böylece alt kısım da yakalanır.
    function planSlices(total, viewport) {
        const last = Math.max(0, total - viewport);
        const offsets = [];
        for (let y = 0; y < last; y += viewport) offsets.push(y);
        offsets.push(last);
        return offsets;
    }

    // Sabit (fixed/sticky) öğe, ekranın üst üçte birindeyse yalnız ilk dilimde, alt üçte birindeyse yalnız son dilimde
    // görünür. Ortadaki sabit öğeler (yüzen düğmeler) her dilimde gizlenir; aksi halde her dilimde tekrar ederler.
    function fixedShown(index, count, centerY, viewportHeight) {
        if (count <= 1) return true;
        if (centerY < viewportHeight * 0.3) return index === 0;
        if (centerY > viewportHeight * 0.7) return index === count - 1;
        return false;
    }

    // Düzenleyici öğeleri: kutu, bulanık, vurgu ve ok iki noktayla (x1,y1 ve x2,y2); metin ve numara bir noktayla
    // (x1,y1) tanımlanır, metin w/h ve numara r ile boyutlanır. Her fonksiyon yeni nesne döndürür veya saf okur.
    function itemBounds(item) {
        if (item.type === 'pen') {
            const xs = item.points.map((p) => p.x);
            const ys = item.points.map((p) => p.y);
            return normalizeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
        }
        if (item.type === 'text') return { x: item.x1, y: item.y1, width: item.w, height: item.h };
        if (item.type === 'number') return { x: item.x1 - item.r, y: item.y1 - item.r, width: item.r * 2, height: item.r * 2 };
        return normalizeRect(item.x1, item.y1, item.x2, item.y2);
    }

    // Okun çizgisine olan en kısa uzaklık; çizgi bir nokta ise nokta uzaklığı
    function distanceToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // Noktanın altındaki en üstteki öğenin dizinini döndürür; yoksa -1. Liste sonundaki öğe üstte sayılır.
    function hitItem(items, point, tolerance) {
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (item.type === 'arrow') {
                if (distanceToSegment(point.x, point.y, item.x1, item.y1, item.x2, item.y2) <= tolerance) return i;
                continue;
            }
            // Kalem: çizginin kendisine yakınlık; sınır kutusunun boş içi seçmez
            if (item.type === 'pen') {
                const p = item.points;
                for (let k = 0; k < p.length; k++) {
                    const q = p[Math.min(k + 1, p.length - 1)];
                    if (distanceToSegment(point.x, point.y, p[k].x, p[k].y, q.x, q.y) <= tolerance) return i;
                }
                continue;
            }
            const b = itemBounds(item);
            if (point.x >= b.x - tolerance && point.x <= b.x + b.width + tolerance
                && point.y >= b.y - tolerance && point.y <= b.y + b.height + tolerance) return i;
        }
        return -1;
    }

    // Seçili öğede sürüklenebilen uç noktalar: kutu/elips/ok/vurgu/bulanık için iki uç; metin, numara ve kalem için yok
    function handlesOf(item) {
        if (item.type === 'text' || item.type === 'number' || item.type === 'pen') return [];
        return [{ key: 'a', x: item.x1, y: item.y1 }, { key: 'b', x: item.x2, y: item.y2 }];
    }

    function translateItem(item, dx, dy) {
        if (item.type === 'pen') return { ...item, points: item.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
        const moved = { ...item, x1: item.x1 + dx, y1: item.y1 + dy };
        if (item.x2 !== undefined) {
            moved.x2 = item.x2 + dx;
            moved.y2 = item.y2 + dy;
        }
        return moved;
    }

    function moveHandle(item, key, point) {
        return key === 'a' ? { ...item, x1: point.x, y1: point.y } : { ...item, x2: point.x, y2: point.y };
    }

    // Görüntü 90° saat yönünde dönünce öğe de döner: (x, y) → (yükseklik − y, x). Metin ve numara yatay kalır;
    // yalnız merkezleri döner.
    function rotateItem(item, height) {
        const turn = (x, y) => ({ x: height - y, y: x });
        if (item.type === 'pen') return { ...item, points: item.points.map((p) => turn(p.x, p.y)) };
        if (item.type === 'text') {
            const c = turn(item.x1 + item.w / 2, item.y1 + item.h / 2);
            return { ...item, x1: c.x - item.w / 2, y1: c.y - item.h / 2 };
        }
        const a = turn(item.x1, item.y1);
        const rotated = { ...item, x1: a.x, y1: a.y };
        if (item.x2 !== undefined) {
            const b = turn(item.x2, item.y2);
            rotated.x2 = b.x;
            rotated.y2 = b.y;
        }
        return rotated;
    }

    // Görüntü k katına ölçeklenince öğenin konumu ve saklanan boyutları (numara yarıçapı, metin ölçüleri) da ölçeklenir
    function scaleItem(item, k) {
        const scaled = { ...item };
        for (const key of ['x1', 'y1', 'x2', 'y2', 'r', 'px', 'w', 'h']) {
            if (item[key] !== undefined) scaled[key] = item[key] * k;
        }
        if (item.points) scaled.points = item.points.map((p) => ({ x: p.x * k, y: p.y * k }));
        return scaled;
    }

    // Bir sonraki numara: mevcut en büyük numaranın bir fazlası (silinen numaralar yeniden kullanılmaz)
    function nextNumber(items) {
        return items.reduce((max, item) => (item.type === 'number' ? Math.max(max, item.n) : max), 0) + 1;
    }

    // Dosya adı şablonu: {date} (yerel saat, 2026-10-24_14-30-05) ve {mode} yerine geçer; {tarih} ve {mod} da kabul
    // edilir. Dosya adına uymayan karakterler tire olur. Şablon boşsa varsayılan kullanılır.
    function fileName(template, mode, date, extension) {
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_`
            + `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
        const source = template && template.trim() ? template : 'capturehub-{date}-{mode}';
        const base = source.replace(/\{(date|tarih)\}/g, stamp).replace(/\{(mode|mod)\}/g, mode);
        return `${base.replace(/[\\/:*?"<>|]/g, '-').trim()}.${extension}`;
    }

    // Geçmişte gösterilecek site adı. Yalnız http(s) adresleri; diğerleri (ve bozuk adres) boş döner,
    // böylece arayüz yalnız web adreslerini bağlantı yapar.
    function siteName(url) {
        try {
            const parsed = new URL(url);
            return /^https?:$/.test(parsed.protocol) ? parsed.hostname : '';
        } catch {
            return '';
        }
    }

    // "1280×713" biçimli boyut; soldan sağa yalıtılır, Arapça ve Urduca arayüzde sayılar yer değiştirmez
    function dimensions(width, height) {
        return `\u2066${width}×${height}\u2069`;
    }

    return {
        normalizeRect, clampRect, scaleRect, planSlices, fixedShown,
        itemBounds, hitItem, handlesOf, translateItem, moveHandle, rotateItem, scaleItem, nextNumber, fileName, siteName, dimensions
    };
})();

if (typeof module !== 'undefined') module.exports = CaptureGeometry;
