// Seçici: bölge modunda sürükleyerek alan, öğe modunda tıklayarak bir öğe seçer.
// Katman, yakalamadan önce kaldırılır; ekran görüntüsünde karartma görünmez. Esc iptal eder.
// Seçim sayfa koordinatında gönderilir: görünümden uzun öğe ya da kenarda kaydırılarak büyütülen bölge,
// servis çalışanında kaydırılıp birleştirilerek tamamıyla yakalanır.
(() => {
    // Önceki seçim (ör. Esc'siz bırakılmış bölge katmanı) açıksa kaldırılır; yoksa yeni mod hiç başlamaz ve
    // sayfada eski mod kalırdı (öğe seçimi tıklamaya yanıt vermezdi)
    if (window.__capturehubSelecting) window.__capturehubSelecting();
    const elementMode = window.__capturehubMode === 'element';
    const listeners = [];
    // Bölge sürüklenirken imleç kenara bu kadar yaklaşınca sayfa kayar (CSS pikseli); hız kenara yakınlıkla artar
    const EDGE = 40;
    const MAX_SCROLL_STEP = 24;

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

    let autoScroll = 0;
    function cleanup() {
        cancelAnimationFrame(autoScroll);
        for (const remove of listeners) remove();
        overlay.remove();
        delete window.__capturehubSelecting;
    }
    window.__capturehubSelecting = cleanup;

    // Kutu görünüm koordinatında çizilir; etiket sayfadaki gerçek boyutu gösterir. Öğe modunda ↑↓ ipucu eklenir.
    function showRect(rect) {
        Object.assign(box.style, { display: 'block', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        label.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}${elementMode ? ' · ↑↓' : ''}`;
    }

    // Katman kalktıktan sonra, bir kare boyandıktan sonra yakalama istenir; yoksa karartma görüntüye girebilir.
    // pageRect sayfa koordinatındadır (DOMRect değil, düz nesne).
    function finish(pageRect) {
        cleanup();
        if (pageRect.width < 4 || pageRect.height < 4) return;
        requestAnimationFrame(() => setTimeout(() => {
            chrome.runtime.sendMessage({
                action: 'region-selected',
                mode: elementMode ? 'element' : 'region',
                rect: pageRect,
                scroll: { x: window.scrollX, y: window.scrollY },
                viewport: { width: window.innerWidth, height: window.innerHeight }
            }).catch(() => {});
        }, 100));
    }

    function toPage(rect) {
        return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
    }

    listen(window, 'keydown', (event) => {
        if (event.key === 'Escape') cleanup();
    }, true);

    if (elementMode) {
        let hovered = null;
        // ↑ ile çıkılan alt öğeler; ↓ geri iner. Fare hareket edince sıfırlanır.
        let below = [];
        const show = () => hovered && showRect(hovered.getBoundingClientRect());
        listen(window, 'pointermove', (event) => {
            hovered = document.elementFromPoint(event.clientX, event.clientY);
            below = [];
            show();
        }, true);
        listen(window, 'keydown', (event) => {
            if (!hovered || !['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'ArrowUp' && hovered.parentElement && hovered !== document.body) {
                below.push(hovered);
                hovered = hovered.parentElement;
            } else if (event.key === 'ArrowDown' && below.length) {
                hovered = below.pop();
            } else if (event.key === 'Enter') {
                return finish(toPage(hovered.getBoundingClientRect()));
            }
            show();
        }, true);
        // Seçim sırasında sayfanın kendi tıklama işleri (bağlantı, düğme) çalışmasın
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
            listen(window, type, (event) => {
                event.preventDefault();
                event.stopPropagation();
            }, true);
        }
        // ↑↓ ile öğe değiştirildiyse vurgulanan öğe alınır; yoksa tıklanan nokta yeniden okunur (fare hiç hareket
        // etmeden tıklanırsa pointermove gelmemiş olabilir)
        listen(window, 'click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const target = (below.length && hovered) || document.elementFromPoint(event.clientX, event.clientY) || hovered;
            if (target) finish(toPage(target.getBoundingClientRect()));
            else cleanup();
        }, true);
    } else {
        // Başlangıç sayfa koordinatında tutulur: sayfa kayınca seçim de büyür
        let start = null;
        let pointer = null;
        const current = () => CaptureGeometry.normalizeRect(start.x, start.y, pointer.x + window.scrollX, pointer.y + window.scrollY);
        const showCurrent = () => {
            const rect = current();
            showRect({ ...rect, x: rect.x - window.scrollX, y: rect.y - window.scrollY });
        };
        // İmleç üst ya da alt kenardayken sayfa her karede biraz kayar
        const tick = () => {
            if (!start) return;
            const step = pointer.y < EDGE ? -Math.ceil(((EDGE - pointer.y) / EDGE) * MAX_SCROLL_STEP)
                : pointer.y > window.innerHeight - EDGE ? Math.ceil(((pointer.y - window.innerHeight + EDGE) / EDGE) * MAX_SCROLL_STEP) : 0;
            if (step) {
                window.scrollBy({ top: step, behavior: 'instant' });
                showCurrent();
            }
            autoScroll = requestAnimationFrame(tick);
        };
        listen(overlay, 'pointerdown', (event) => {
            start = { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY };
            pointer = { x: event.clientX, y: event.clientY };
            overlay.setPointerCapture(event.pointerId);
            box.style.display = 'block';
            overlay.style.background = 'transparent';
            autoScroll = requestAnimationFrame(tick);
        });
        listen(overlay, 'pointermove', (event) => {
            if (!start) return;
            pointer = { x: event.clientX, y: event.clientY };
            showCurrent();
        });
        listen(overlay, 'pointerup', (event) => {
            if (!start) return;
            pointer = { x: event.clientX, y: event.clientY };
            const rect = current();
            start = null;
            finish(rect);
        });
    }
})();
