// Düzenleyici çizim işlevleri. Her öğe görüntü pikselleriyle çizilir; ekran ve dışa aktarma aynı işlevi kullanır.
// Seçim çerçevesi ve tutamaçlar yalnız ekranda çizilir (paintSelection); dışa aktarılan görüntüye girmez.
var CaptureTools = (() => {
    const SIZE_FACTOR = { xs: 0.4, s: 0.6, m: 1, l: 1.6, xl: 2.4 };
    const FONT = 'Geist, ui-sans-serif, system-ui, sans-serif';
    const DARK_INK = '#18181b';

    // WCAG göreli parlaklığı (0 siyah, 1 beyaz); renk #rrggbb biçimindedir
    function luminance(hex) {
        const channel = (i) => {
            const c = parseInt(hex.slice(i, i + 2), 16) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    }

    // Açık renkli numaranın yazısı koyu, koyu renklinin beyaz olur. Eşik 0.3: sarı, yeşil ve beyaz açık;
    // pembe, kırmızı, mavi ve siyah koyu sayılır.
    function isLightColor(hex) {
        return luminance(hex) > 0.3;
    }

    function strokeFor(width, size) {
        return Math.max(2, Math.round((width / 400) * SIZE_FACTOR[size]));
    }

    function fontFor(width, size) {
        return Math.max(12, Math.round((width / 45) * SIZE_FACTOR[size]));
    }

    function radiusFor(width, size) {
        return Math.max(12, Math.round(fontFor(width, size) * 0.8));
    }

    // Metin öğesinin kutusu: tıklama ve seçim için ölçülür, öğede saklanır
    function measureText(ctx, text, size) {
        ctx.font = `600 ${size}px ${FONT}`;
        return { w: Math.ceil(ctx.measureText(text).width), h: Math.ceil(size * 1.25) };
    }

    function drawArrow(ctx, { x1, y1, x2, y2 }, stroke) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = stroke * 5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.moveTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }

    // Bulanıklaştırma: bölgeyi kaba bir ızgaraya indirip büyütür; piksel bloklu bir gizleme
    function pixelate(ctx, { x, y, width, height }) {
        if (width < 1 || height < 1) return;
        const block = Math.max(6, Math.round(ctx.canvas.width / 80));
        const small = document.createElement('canvas');
        small.width = Math.max(1, Math.round(width / block));
        small.height = Math.max(1, Math.round(height / block));
        small.getContext('2d').drawImage(ctx.canvas, x, y, width, height, 0, 0, small.width, small.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, small.width, small.height, x, y, width, height);
        ctx.imageSmoothingEnabled = true;
    }

    function paintItem(ctx, item) {
        const width = ctx.canvas.width;
        const stroke = strokeFor(width, item.size);
        const rect = CaptureGeometry.normalizeRect(item.x1, item.y1, item.x2, item.y2);
        ctx.save();
        ctx.strokeStyle = item.color;
        ctx.fillStyle = item.color;
        ctx.lineWidth = stroke;
        ctx.lineJoin = 'round';
        if (item.type === 'rect') {
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        } else if (item.type === 'arrow') {
            drawArrow(ctx, item, stroke);
        } else if (item.type === 'blur') {
            pixelate(ctx, rect);
        } else if (item.type === 'highlight') {
            // Çarpım kipi: koyu metnin üstündeki vurgu metni okunur bırakır
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.55;
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        } else if (item.type === 'number') {
            const r = item.r;
            ctx.beginPath();
            ctx.arc(item.x1, item.y1, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = `700 ${r}px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isLightColor(item.color) ? DARK_INK : '#ffffff';
            ctx.fillText(String(item.n), item.x1, item.y1 + 1);
        } else if (item.type === 'text') {
            ctx.font = `600 ${item.px}px ${FONT}`;
            ctx.textBaseline = 'top';
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(2, item.px / 6);
            // Karşıt renkli kenarlık: metin açık ya da koyu her zeminde okunur
            ctx.strokeStyle = luminance(item.color) < 0.1 ? '#ffffff' : DARK_INK;
            ctx.strokeText(item.text, item.x1, item.y1);
            ctx.fillStyle = item.color;
            ctx.fillText(item.text, item.x1, item.y1);
        }
        ctx.restore();
    }

    // Seçili öğenin çerçevesi ve uç tutamaçları (yalnız ekranda)
    function paintSelection(ctx, item, handles, bounds) {
        const unit = Math.max(2, Math.round(ctx.canvas.width / 600));
        ctx.save();
        ctx.strokeStyle = '#f74a87';
        ctx.lineWidth = unit;
        ctx.setLineDash([unit * 3, unit * 2]);
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        for (const handle of handles) {
            ctx.beginPath();
            ctx.arc(handle.x, handle.y, unit * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    return { SIZE_FACTOR, luminance, isLightColor, strokeFor, fontFor, radiusFor, measureText, paintItem, paintSelection };
})();

if (typeof module !== 'undefined') module.exports = CaptureTools;
