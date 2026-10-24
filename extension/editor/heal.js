// Doldurma motoru: iyileştirme fırçası ve içeriğe duyarlı doldurma aynı işlevi kullanır. Maskelenen pikseller
// çevrelerindeki bilinen piksellerden yeniden üretilir. Tarayıcıda global CaptureHeal, Node'da module.exports.
// İki yöntem: düz zemin, degrade ve UI yüzeyi için yayılma (ağırlıklı ortalama + Laplace yumuşatma); çevre dokuluysa
// (fotoğraf, desen) örnek tabanlı doldurma: çevredeki en benzer 9×9 yamalar deliğe kopyalanır (Criminisi yöntemi,
// adaylar PatchMatch gibi rastgele örnekleme ve komşudan yayılmayla aranır).
// ponytail: aday arama örneklemelidir. Sınır: çok büyük dokulu alanlarda süre artar, uzun yapı çizgileri (ufuk, kenar)
// her zaman kusursuz sürmez. Yükseltme: çok çözünürlüklü PatchMatch gerekirse.
var CaptureHeal = (() => {
    // Bu kadar pikselden büyük alan reddedilir: tarayıcı sekmesi uzun süre donmasın
    const MAX_PIXELS = 2000000;
    const WINDOW = 2;
    // Aşırı gevşetme katsayısı: Laplace çözümü düz Gauss-Seidel'den çok daha az turda yakınsar
    const OMEGA = 1.95;
    // Doku: yama yarıçapı (9×9), arama penceresinin delik çevresindeki payı, rastgele aday sayısı
    const PATCH = 4;
    const SEARCH_MARGIN = 48;
    const RANDOM_CANDIDATES = 300;
    // Çevre halkasında Laplace değeri bu eşiği aşan piksel oranı TEXTURE_SHARE'den büyükse çevre dokulu sayılır
    const TEXTURE_LAPLACE = 24;
    const TEXTURE_SHARE = 0.2;
    const RING = 6;

    // imageData: { data (RGBA), width, height }; mask: Uint8Array, 1 = doldurulacak. Veri yerinde değişir.
    // method: 'auto' (çevreye göre seçer), 'diffuse' ya da 'texture'. Doldurulan piksel sayısını döndürür.
    // Hiç bilinen piksel yoksa (tüm görüntü maskeli) bir şey yapmaz.
    function inpaint(imageData, mask, method = 'auto') {
        const { width, height } = imageData;
        const total = width * height;
        let count = 0;
        for (let i = 0; i < total; i++) count += mask[i] ? 1 : 0;
        if (count > MAX_PIXELS) throw new Error('healTooLarge');
        if (count === 0 || count === total) return 0;
        const textured = method === 'texture' || (method === 'auto' && isTextured(imageData, mask));
        // Doku yönteminin kaynak yama bulamadığı pikseller (delik çok büyük, çevre dar) yayılmayla tamamlanır
        const rest = textured ? synthesize(imageData, mask) : mask;
        diffuse(imageData, rest);
        return count;
    }

    // Yayılma: kenardan içe ağırlıklı ortalama, ardından Laplace yumuşatma
    function diffuse(imageData, mask) {
        const { data, width, height } = imageData;
        const total = width * height;
        if (!mask.some((v) => v)) return;
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
    }

    // Maskenin çevresindeki halkada (RING piksel) parlaklığın Laplace değeri ölçülür. Düz zemin ve degradede ~0;
    // fotoğraf ve desende yüksektir. Halkadaki tek tük kenarlar (çerçeve, yazı) oranı düşük kaldığı için karar değişmez.
    function isTextured(imageData, mask) {
        const { data, width, height } = imageData;
        const box = maskBox(mask, width, height, RING + 1);
        const lum = (i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        let ring = 0;
        let rough = 0;
        for (let y = box.y0 + 1; y < box.y1; y++) {
            for (let x = box.x0 + 1; x < box.x1; x++) {
                const i = y * width + x;
                if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - width] || mask[i + width]) continue;
                if (!nearMask(mask, x, y, width, height)) continue;
                ring++;
                const laplace = Math.abs(4 * lum(i) - lum(i - 1) - lum(i + 1) - lum(i - width) - lum(i + width));
                if (laplace > TEXTURE_LAPLACE) rough++;
            }
        }
        return ring > 0 && rough / ring > TEXTURE_SHARE;
    }

    function nearMask(mask, x, y, width, height) {
        for (let dy = -RING; dy <= RING; dy += 2) {
            for (let dx = -RING; dx <= RING; dx += 2) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx]) return true;
            }
        }
        return false;
    }

    // Maskenin sınır kutusu (pad kadar genişletilmiş, görüntü içinde); x1/y1 dahil değil
    function maskBox(mask, width, height, pad) {
        let x0 = width;
        let y0 = height;
        let x1 = 0;
        let y1 = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!mask[y * width + x]) continue;
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x + 1);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y + 1);
            }
        }
        return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(width, x1 + pad), y1: Math.min(height, y1 + pad) };
    }

    // Belirlenimci rastgele sayı (mulberry32): aynı görüntü ve maske her zaman aynı sonucu verir
    function random(seed) {
        let t = seed >>> 0;
        return () => {
            t = (t + 0x6d2b79f5) >>> 0;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Örnek tabanlı doldurma. Delik kenarındaki en güvenilir noktadan başlayarak her adımda çevredeki tamamen bilinen
    // en benzer 9×9 yama aranır ve bilinmeyen pikselleri kopyalanır. Kalan (doldurulamayan) maske döndürülür.
    function synthesize(imageData, mask) {
        const { data, width, height } = imageData;
        const box = maskBox(mask, width, height, SEARCH_MARGIN);
        const bw = box.x1 - box.x0;
        const bh = box.y1 - box.y0;
        const at = (x, y) => (y + box.y0) * width + (x + box.x0);
        const known = new Uint8Array(bw * bh);
        const confidence = new Float32Array(bw * bh);
        for (let y = 0; y < bh; y++) {
            for (let x = 0; x < bw; x++) {
                const k = mask[at(x, y)] ? 0 : 1;
                known[y * bw + x] = k;
                confidence[y * bw + x] = k;
            }
        }
        // Kaynak yama yalnız başlangıçta tamamen bilinen bölgeden seçilir; bunun için bilinmeyen sayısının integrali
        const holes = new Int32Array((bw + 1) * (bh + 1));
        for (let y = 0; y < bh; y++) {
            for (let x = 0; x < bw; x++) {
                holes[(y + 1) * (bw + 1) + x + 1] = (known[y * bw + x] ? 0 : 1)
                    + holes[y * (bw + 1) + x + 1] + holes[(y + 1) * (bw + 1) + x] - holes[y * (bw + 1) + x];
            }
        }
        const sourceOk = (cx, cy) => {
            if (cx < PATCH || cy < PATCH || cx >= bw - PATCH || cy >= bh - PATCH) return false;
            const x0 = cx - PATCH;
            const y0 = cy - PATCH;
            const x1 = cx + PATCH + 1;
            const y1 = cy + PATCH + 1;
            return holes[y1 * (bw + 1) + x1] - holes[y0 * (bw + 1) + x1] - holes[y1 * (bw + 1) + x0] + holes[y0 * (bw + 1) + x0] === 0;
        };
        const offsets = new Int32Array(bw * bh * 2);
        const hasOffset = new Uint8Array(bw * bh);
        const rand = random(bw * 73856093 ^ bh * 19349663);

        // Bilinen yama piksellerinde renk farkının karesi; erken çıkış en iyi sonucu geçince
        const distance = (tx, ty, sx, sy, limit) => {
            let sum = 0;
            for (let dy = -PATCH; dy <= PATCH; dy++) {
                const ty2 = ty + dy;
                if (ty2 < 0 || ty2 >= bh) continue;
                for (let dx = -PATCH; dx <= PATCH; dx++) {
                    const tx2 = tx + dx;
                    if (tx2 < 0 || tx2 >= bw || !known[ty2 * bw + tx2]) continue;
                    const a = at(tx2, ty2) * 4;
                    const b = at(sx + dx, sy + dy) * 4;
                    const r = data[a] - data[b];
                    const g = data[a + 1] - data[b + 1];
                    const bl = data[a + 2] - data[b + 2];
                    sum += r * r + g * g + bl * bl;
                    if (sum >= limit) return sum;
                }
            }
            return sum;
        };

        const onFront = (x, y) => !known[y * bw + x] && (
            (x > 0 && known[y * bw + x - 1]) || (x < bw - 1 && known[y * bw + x + 1])
            || (y > 0 && known[(y - 1) * bw + x]) || (y < bh - 1 && known[(y + 1) * bw + x]));
        const front = new Set();
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (onFront(x, y)) front.add(y * bw + x);

        while (front.size) {
            // Öncelik: yamadaki bilinen piksellerin güveni (kenara en çok dayanan nokta önce dolar)
            let best = -1;
            let bestScore = -1;
            for (const p of front) {
                const px = p % bw;
                const py = (p - px) / bw;
                let c = 0;
                for (let dy = -PATCH; dy <= PATCH; dy++) {
                    for (let dx = -PATCH; dx <= PATCH; dx++) {
                        const x = px + dx;
                        const y = py + dy;
                        if (x >= 0 && x < bw && y >= 0 && y < bh) c += confidence[y * bw + x];
                    }
                }
                if (c > bestScore) {
                    bestScore = c;
                    best = p;
                }
            }
            const tx = best % bw;
            const ty = (best - tx) / bw;

            // Adaylar: komşu doldurulmuş piksellerin kaynak kayması, rastgele örnekler, en iyinin çevresinde daralan arama
            let bestSource = null;
            let bestDistance = Infinity;
            const consider = (sx, sy) => {
                if (!sourceOk(sx, sy)) return;
                const d = distance(tx, ty, sx, sy, bestDistance);
                if (d < bestDistance) {
                    bestDistance = d;
                    bestSource = [sx, sy];
                }
            };
            for (let dy = -PATCH; dy <= PATCH; dy++) {
                for (let dx = -PATCH; dx <= PATCH; dx++) {
                    const x = tx + dx;
                    const y = ty + dy;
                    if (x < 0 || x >= bw || y < 0 || y >= bh || !hasOffset[y * bw + x]) continue;
                    consider(tx + offsets[(y * bw + x) * 2], ty + offsets[(y * bw + x) * 2 + 1]);
                }
            }
            for (let n = 0; n < RANDOM_CANDIDATES; n++) consider(Math.floor(rand() * bw), Math.floor(rand() * bh));
            if (bestSource) {
                for (let radius = Math.max(bw, bh) / 2; radius >= 1; radius /= 2) {
                    const [sx, sy] = bestSource;
                    consider(Math.round(sx + (rand() * 2 - 1) * radius), Math.round(sy + (rand() * 2 - 1) * radius));
                }
            }
            if (!bestSource) break;

            const [sx, sy] = bestSource;
            const patchConfidence = bestScore / ((2 * PATCH + 1) ** 2);
            for (let dy = -PATCH; dy <= PATCH; dy++) {
                for (let dx = -PATCH; dx <= PATCH; dx++) {
                    const x = tx + dx;
                    const y = ty + dy;
                    if (x < 0 || x >= bw || y < 0 || y >= bh || known[y * bw + x]) continue;
                    const to = at(x, y) * 4;
                    const from = at(sx + dx, sy + dy) * 4;
                    for (let c = 0; c < 4; c++) data[to + c] = data[from + c];
                    known[y * bw + x] = 1;
                    confidence[y * bw + x] = patchConfidence;
                    offsets[(y * bw + x) * 2] = sx - tx;
                    offsets[(y * bw + x) * 2 + 1] = sy - ty;
                    hasOffset[y * bw + x] = 1;
                    front.delete(y * bw + x);
                }
            }
            // Yamanın çevresindeki yeni kenar pikselleri sıraya girer
            for (let dy = -PATCH - 1; dy <= PATCH + 1; dy++) {
                for (let dx = -PATCH - 1; dx <= PATCH + 1; dx++) {
                    const x = tx + dx;
                    const y = ty + dy;
                    if (x >= 0 && x < bw && y >= 0 && y < bh && onFront(x, y)) front.add(y * bw + x);
                }
            }
        }

        const rest = new Uint8Array(width * height);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (!known[y * bw + x]) rest[at(x, y)] = 1;
        return rest;
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

    return { inpaint, isTextured, MAX_PIXELS };
})();

if (typeof module !== 'undefined') module.exports = CaptureHeal;
