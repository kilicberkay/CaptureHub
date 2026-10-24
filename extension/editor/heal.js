// Doldurma motoru: iyileştirme fırçası ve içeriğe duyarlı doldurma aynı işlevi kullanır. Maskelenen pikseller
// çevrelerindeki bilinen piksellerden yeniden üretilir. Tarayıcıda global CaptureHeal, Node'da module.exports.
// ponytail: kenardan içe doğru ağırlıklı ortalama + Laplace yumuşatma. Sınır: düz zemin, degrade ve UI arka planında
// temiz sonuç verir; fotoğraf dokusunu sentezlemez, yumuşatır. Yükseltme: yama tabanlı doldurma (PatchMatch) gerekirse.
var CaptureHeal = (() => {
    // Bu kadar pikselden büyük alan reddedilir: tarayıcı sekmesi uzun süre donmasın
    const MAX_PIXELS = 2000000;
    const WINDOW = 2;
    // Aşırı gevşetme katsayısı: Laplace çözümü düz Gauss-Seidel'den çok daha az turda yakınsar
    const OMEGA = 1.95;

    // imageData: { data (RGBA), width, height }; mask: Uint8Array, 1 = doldurulacak. Veri yerinde değişir.
    // Doldurulan piksel sayısını döndürür. Hiç bilinen piksel yoksa (tüm görüntü maskeli) bir şey yapmaz.
    function inpaint(imageData, mask) {
        const { data, width, height } = imageData;
        const total = width * height;
        let count = 0;
        for (let i = 0; i < total; i++) count += mask[i] ? 1 : 0;
        if (count > MAX_PIXELS) throw new Error('healTooLarge');
        if (count === 0 || count === total) return 0;

        const known = new Uint8Array(total);
        for (let i = 0; i < total; i++) known[i] = mask[i] ? 0 : 1;

        // 1. Soğan kabuğu: her katman bir önceki katmanın sonunda bilinenlerden hesaplanır; böylece sıra yanlılığı olmaz
        const queued = new Uint8Array(total);
        let layer = [];
        for (let i = 0; i < total; i++) {
            if (mask[i] && hasKnownNeighbor(i, known, width, height)) {
                layer.push(i);
                queued[i] = 1;
            }
        }
        const filled = [];
        let depth = 0;
        while (layer.length) {
            depth++;
            const values = layer.map((i) => average(i, data, known, width, height));
            layer.forEach((i, n) => {
                const v = values[n];
                if (!v) return;
                data.set(v, i * 4);
            });
            for (const i of layer) {
                known[i] = 1;
                filled.push(i);
            }
            const next = [];
            for (const i of layer) {
                forNeighbors(i, width, height, (j) => {
                    if (mask[j] && !queued[j]) {
                        queued[j] = 1;
                        next.push(j);
                    }
                });
            }
            layer = next;
        }

        smooth(data, filled, width, height, Math.min(200, depth + 30));
        return filled.length;
    }

    // 2. Laplace yumuşatma (SOR): kabuk sırasının bıraktığı çizgileri giderir, degradeleri doğrusal tamamlar.
    // Değerler yalnız maskenin sınır kutusu (1 piksel kenarla) için kayan noktada tutulur; 8 bitlik yuvarlama
    // yakınsamayı durdurmasın ve çok uzun görüntülerde bellek şişmesin.
    function smooth(data, filled, width, height, passes) {
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;
        for (const i of filled) {
            const x = i % width;
            const y = (i - x) / width;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        minX = Math.max(0, minX - 1);
        minY = Math.max(0, minY - 1);
        maxX = Math.min(width - 1, maxX + 1);
        maxY = Math.min(height - 1, maxY + 1);
        const boxWidth = maxX - minX + 1;
        const buf = new Float32Array(boxWidth * (maxY - minY + 1) * 4);
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const from = (y * width + x) * 4;
                const to = ((y - minY) * boxWidth + (x - minX)) * 4;
                for (let c = 0; c < 4; c++) buf[to + c] = data[from + c];
            }
        }
        // Her doldurulan pikselin kutudaki yeri ve görüntü içinde kalan dört komşusu
        const count = filled.length;
        const pos = new Int32Array(count);
        const neighbors = new Int32Array(count * 4);
        const degree = new Uint8Array(count);
        filled.forEach((i, k) => {
            const x = i % width;
            const y = (i - x) / width;
            const p = (y - minY) * boxWidth + (x - minX);
            pos[k] = p * 4;
            const add = (q) => {
                neighbors[k * 4 + degree[k]] = q * 4;
                degree[k]++;
            };
            if (x > 0) add(p - 1);
            if (x < width - 1) add(p + 1);
            if (y > 0) add(p - boxWidth);
            if (y < height - 1) add(p + boxWidth);
        });
        for (let pass = 0; pass < passes; pass++) {
            for (let k = 0; k < count; k++) {
                const p = pos[k];
                const d = degree[k];
                for (let c = 0; c < 4; c++) {
                    let sum = 0;
                    for (let m = 0; m < d; m++) sum += buf[neighbors[k * 4 + m] + c];
                    buf[p + c] += OMEGA * (sum / d - buf[p + c]);
                }
            }
        }
        filled.forEach((i, k) => {
            for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(buf[pos[k] + c]);
        });
    }

    function forNeighbors(i, width, height, visit) {
        const x = i % width;
        const y = (i - x) / width;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if ((dx || dy) && x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) visit(i + dy * width + dx);
            }
        }
    }

    function hasKnownNeighbor(i, known, width, height) {
        let found = false;
        forNeighbors(i, width, height, (j) => {
            found = found || known[j] === 1;
        });
        return found;
    }

    // 5×5 penceredeki bilinen piksellerin uzaklığın karesiyle ters orantılı ağırlıklı ortalaması
    function average(i, data, known, width, height) {
        const x = i % width;
        const y = (i - x) / width;
        const sum = [0, 0, 0, 0];
        let weight = 0;
        for (let dy = -WINDOW; dy <= WINDOW; dy++) {
            for (let dx = -WINDOW; dx <= WINDOW; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if ((!dx && !dy) || nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                const j = ny * width + nx;
                if (!known[j]) continue;
                const w = 1 / (dx * dx + dy * dy);
                for (let c = 0; c < 4; c++) sum[c] += data[j * 4 + c] * w;
                weight += w;
            }
        }
        return weight ? sum.map((s) => Math.round(s / weight)) : null;
    }

    return { inpaint, MAX_PIXELS };
})();

if (typeof module !== 'undefined') module.exports = CaptureHeal;
