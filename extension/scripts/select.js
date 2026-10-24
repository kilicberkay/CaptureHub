// Seçici: bölge modunda sürükleyerek alan, öğe modunda tıklayarak bir öğe seçer.
// Katman, yakalamadan önce kaldırılır; ekran görüntüsünde karartma görünmez. Esc iptal eder.
(() => {
    // Önceki seçim (ör. Esc'siz bırakılmış bölge katmanı) açıksa kaldırılır; yoksa yeni mod hiç başlamaz ve
    // sayfada eski mod kalırdı (öğe seçimi tıklamaya yanıt vermezdi)
    if (window.__capturehubSelecting) window.__capturehubSelecting();
    const elementMode = window.__capturehubMode === 'element';
    const listeners = [];

    const overlay = document.createElement('div');
    overlay.setAttribute('data-capturehub', 'select');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '2147483647', cursor: 'crosshair', userSelect: 'none',
        // Bölge modunda sürükleme başlayana kadar sayfa karartılır; sonra karartmayı seçim kutusunun gölgesi yapar
        background: elementMode ? 'transparent' : 'rgba(9, 9, 11, 0.35)',
        // Öğe modunda katman tıklamayı almaz; böylece altındaki öğe elementFromPoint ile bulunur
        pointerEvents: elementMode ? 'none' : 'auto'
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'fixed', display: 'none', boxSizing: 'border-box', border: '2px solid #f74a87', borderRadius: '6px',
        background: elementMode ? 'rgba(247, 74, 135, 0.15)' : 'transparent',
        boxShadow: elementMode ? 'none' : '0 0 0 9999px rgba(9, 9, 11, 0.5)', pointerEvents: 'none'
    });

    const label = document.createElement('span');
    Object.assign(label.style, {
        position: 'absolute', top: '6px', left: '6px', padding: '2px 6px', borderRadius: '6px', background: '#c2185b',
        color: '#ffffff', font: '500 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', whiteSpace: 'nowrap'
    });
    box.appendChild(label);
    overlay.appendChild(box);
    document.documentElement.appendChild(overlay);

    function listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        listeners.push(() => target.removeEventListener(type, handler, options));
    }

    function cleanup() {
        for (const remove of listeners) remove();
        overlay.remove();
        delete window.__capturehubSelecting;
    }
    window.__capturehubSelecting = cleanup;

    function showRect(rect) {
        Object.assign(box.style, { display: 'block', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        label.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    }

    // Katman kalktıktan sonra, bir kare boyandıktan sonra yakalama istenir; yoksa karartma görüntüye girebilir
    // DOMRect mesajla gönderilmeden önce düz nesneye çevrilir
    function finish({ x, y, width, height }) {
        const rect = { x, y, width, height };
        cleanup();
        if (rect.width < 4 || rect.height < 4) return;
        requestAnimationFrame(() => setTimeout(() => {
            chrome.runtime.sendMessage({
                action: 'region-selected',
                mode: elementMode ? 'element' : 'region',
                rect,
                viewport: { width: window.innerWidth, height: window.innerHeight }
            }).catch(() => {});
        }, 100));
    }

    listen(window, 'keydown', (event) => {
        if (event.key === 'Escape') cleanup();
    }, true);

    if (elementMode) {
        let hovered = null;
        listen(window, 'pointermove', (event) => {
            hovered = document.elementFromPoint(event.clientX, event.clientY);
            if (hovered) showRect(hovered.getBoundingClientRect());
        }, true);
        // Seçim sırasında sayfanın kendi tıklama işleri (bağlantı, düğme) çalışmasın
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
            listen(window, type, (event) => {
                event.preventDefault();
                event.stopPropagation();
            }, true);
        }
        // Tıklanan nokta yeniden okunur: fare hiç hareket etmeden tıklanırsa pointermove gelmemiş olabilir
        listen(window, 'click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const target = document.elementFromPoint(event.clientX, event.clientY) || hovered;
            if (target) finish(target.getBoundingClientRect());
            else cleanup();
        }, true);
    } else {
        let start = null;
        listen(overlay, 'pointerdown', (event) => {
            start = { x: event.clientX, y: event.clientY };
            overlay.setPointerCapture(event.pointerId);
            box.style.display = 'block';
            overlay.style.background = 'transparent';
        });
        listen(overlay, 'pointermove', (event) => {
            if (!start) return;
            showRect(CaptureGeometry.normalizeRect(start.x, start.y, event.clientX, event.clientY));
        });
        listen(overlay, 'pointerup', (event) => {
            if (!start) return;
            const rect = CaptureGeometry.normalizeRect(start.x, start.y, event.clientX, event.clientY);
            start = null;
            finish(rect);
        });
    }
})();
