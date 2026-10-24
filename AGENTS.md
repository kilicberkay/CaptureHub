# CaptureHub — Ajan Notları

## Proje Özeti
MV3 Chrome uzantısı: görünür alan, tam sayfa, bölge ve öğe ekran görüntüsü; düzenleyici (seçme, taşıma, kutu, ok,
metin, bulanıklaştırma, numara, vurgu, kırpma, geri al/yinele; hazır + özel renk, XS–XL boyut), kopyalama, dışa aktarma
(PNG/JPEG/WebP, `chrome.downloads`), yerel geçmiş (kaynak adres/başlık, arama, klasörde göster), simge sağ tık menüsü,
ayar yedeği ve sıfırlama, açık/koyu/sistem tema.
Çalışma zamanında bağımlılık yok; `extension/` olduğu gibi yüklenir. npm yalnızca testler ve paketleme için.
Görsel tema FillHub ile aynıdır (`extension/shared/ui.css`: tokenlar, Geist, `chip`/`chip-active`/`meta`/`eyebrow`).
15 dil: `extension/shared/i18n.js` (her dilde aynı 137 anahtar) ve `extension/_locales/` (manifest, komut, menü metinleri).

## Dosya Yapısı
- `extension/manifest.json`: MV3; izinler `activeTab`, `contextMenus`, `downloads`, `scripting`, `storage`; host izni yok;
  komutlar `capture_visible` (Alt+Shift+V), `capture_full` (F), `capture_region` (R), `capture_element` (E). FillHub
  Ctrl+Shift+F/Y/U kullanır; bunlarla çakışan kısayol önerilmez. Önerilen kısayollar yalnız ilk kurulumda atanır.
- `extension/scripts/background.js`: servis çalışanı. `measurePage` (pencere ya da tek kaydırılabilir kapsayıcı),
  `captureFullPage` + `stitch`, `startSelection`/`finishRegion`, `openEditor` (meta'ya `url`, `title`), gecikme
  (`countdown`), `onInstalled` içinde `removeAll` + simge (`contexts: ['action']`) menüsü, `handleMenuClick`, `COMMAND_MODES`.
  Simge menüsünde Chrome en fazla 6 üst düzey öğe gösterir.
- `extension/scripts/select.js`: sayfaya enjekte seçici (bölge: sürükle; öğe: tıkla). Mod `window.__capturehubMode` ile gelir.
- `extension/scripts/geometry.js` (`CaptureGeometry`): dikdörtgen, ölçek, kaydırma dilimleri, sabit öğe kuralı, öğe
  isabet testi, tutamaç, numara, dosya adı şablonu. Tarayıcıda global, Node'da `module.exports`.
- `extension/scripts/db.js` (`CaptureStore`): IndexedDB sürüm 2; mağazalar `meta`, `blobs` (özgün görüntü, hiç
  değişmez), `thumbs`, `edits`; silme ve sınır dört mağazayı birlikte temizler; küçük resim hatası kaydı düşürmez.
  `update` indirme kimliğini (`downloadId`) yazar.
- `extension/shared/settings.js` (`CaptureSettings`): tek `DEFAULTS`, izinli değerler, `createBackup`/`parseBackup`.
  Yeni ayar eklenirse buraya (varsayılan + doğrulayıcı) eklenir; yedek ve sıfırlama otomatik kapsar.
- `extension/shared/theme.js` (`CaptureTheme`): her sayfanın `<head>` bölümünde `settings.js`'ten sonra yüklenir; tema
  sınıfı yalnız buradan uygulanır (sayfalarda ayrı `applyTheme` yok).
- `extension/popup/`: modlar, gecikme, son yakalamalar, tema.
- `extension/editor/`: `tools.js` (çizim, dışa aktarma ile aynı işlev), `editor.js` (etkileşim, geçmiş, kırpma, döndürme,
  boyutlandırma, kalem, elips, damlalık, dışa aktarma), `heal.js` (`CaptureHeal.inpaint`: leke iyileştirme ve içeriğe
  duyarlı doldurmanın ortak motoru; saf işlev, Node'da test edilir). Araç kısayolları `TOOL_NAMES` içinden türetilir.
- `extension/options/`: genel ayarlar, yedek/sıfırlama, geçmiş (arama, site bağlantısı, klasörde göster), güncel kısayol
  listesi (`chrome.commands.getAll`), hakkında.
- `extension/shared/i18n.js` (`CaptureI18n`): çeviri tablosu. Sayfalarda `data-i18n`, `data-i18n-title`, `data-i18n-label`.
- `tools/`: `check-syntax.js`, `run-tests.js`, `build.js` (zip), `changelog-section.js`, `lib/browser.mjs` (CDP istemcisi),
  `lib/capture.mjs` (görsel yardımcıları), `make-readme-shots.mjs` + `make-store-assets.mjs` (`npm run images`, yalnız
  Chromium), `make-demo.mjs` (`npm run demo`, Chromium + ffmpeg). Görseller `tests/e2e/fixtures/demo.html` (uydurma
  "Northwind" raporu) üzerinden üretilir; fikstür sunucusu `fonts/` yolunu uzantının yazı tiplerinden verir.
- `tests/unit/`: `node --test` birim testleri (geometri, düzenleyici geometrisi ve araçları, ayar yedeği, çeviri paritesi,
  manifest/HTML yol ve komut denetimi, ağ çağrısı yasağı).
- `tests/e2e/`: gerçek Chromium testleri (`harness.mjs`, `capture.e2e.test.mjs`, `fixtures/tall.html`).
- `docs/`: `ARCHITECTURE.md`, `TRANSLATING.md`, `FAQ.md`, `THIRD_PARTY_NOTICES.md`, `images/` (README görselleri,
  `tr/` Türkçe), `videos/`. Kökte `README.md` (EN) + `README.tr.md`, `LICENSE` (MIT), `PRIVACY.md`, `CHANGELOG.md`;
  `store/` (ilan + `assets/`). Herkese açık belgeler ve `.github/` İngilizcedir (FillHub düzeni); AGENTS.md Türkçe kalır.
- Depo: https://github.com/kilicberkay/CaptureHub (herkese açık). Sürüm etiketi `v<manifest sürümü>`; etiket
  gönderilince `release.yml` testleri koşturup zip + SHA256SUMS ile Release oluşturur (notlar CHANGELOG'dan).

## Doğrulama
1. `npm run check`: her JS dosyasında `node --check`.
2. `npm run test:quick`: birim testleri ve statik denetimler (Chromium gerektirmez).
3. `npm test`: yukarıdakiler + e2e. Chromium yoksa e2e atlanır.
4. `npm run build` → `python3 -m zipfile -t dist/capturehub-<sürüm>.zip`.
5. Elle: `chrome://extensions` → Paketlenmemiş yükle → `extension/`.

Durum (1.2.0): `npm test` bu makinede tam geçiyor (46 birim, 35 e2e; e2e yaklaşık 1,5 dk). Chromium: Playwright `chromium-1194`
(`~/.cache/ms-playwright`); Arch'ta çalışması için `nss nspr at-spi2-core libcups libxkbcommon libxcomposite libxdamage
libxfixes libxrandr mesa cairo pango alsa-lib` gerekir. E2E'de simge sağ tık menüsü görsel olarak açılamaz
(`handleMenuClick` doğrudan çağrılır); `downloads.show` dosya yöneticisini açtığı için tıklanmaz.
- E2E notları: activeTab izni için önce bir komut kısayolu basılır (`pressAltShift`). Medya sorgusu (sistem teması)
  değişikliği yalnız görünür sekmede bildirilir; test sayfası önce öne alınır. `tall.html` bantları `nth-child` ile
  boyanır; sabit başlık ve alt bar bantlardan sonra gelmelidir.

## Değişmez Kurallar
- Yakalama kotası: `captureVisibleTab` saniyede en fazla iki çağrı. Tam sayfada `CAPTURE_INTERVAL_MS` bekleme zorunlu.
- Kaydırma `behavior: 'instant'`; "smooth" kaydırma yakalamayı animasyon ortasında alır.
- Sayfada serileştirilip çalıştırılan işlevler (`measurePage`, `applyFixedVisibility`, `scrollPageTo`, `restorePage`,
  `setSelectMode`) kendi kapsamlarındaki servis çalışanı değişkenlerine bağlı olamaz. Ortak mantık `CaptureGeometry`'den
  gelir; `geometry.js` bu işlevlerden önce enjekte edilir.
- Seçici katmanı yakalamadan önce kaldırılır; karartma ekran görüntüsüne girmez.
- Düzenleyici öğeleri görüntü pikselleriyle saklanır; seçim çerçevesi ve tutamaçlar yalnız ekranda çizilir, dışa aktarılmaz.
- Düzenleyicide öğe ya da taban değişince `render()` (önbelleği yeniden kurar, otomatik kaydı tetikler); fare
  hareketindeki önizlemeler `renderOverlay()` kullanır. Her değişiklik `snapshot()` ile `state.version` artırır.
- Taban görüntüyü değiştiren her işlem (kırpma, iyileştirme, doldurma, döndürme, boyutlandırma) önce `snapshot()` alır.
  Yeni öğe türü eklenirse `CaptureGeometry` içindeki `itemBounds`, `hitItem`, `handlesOf`, `translateItem`,
  `rotateItem`, `scaleItem` ve `CaptureTools.paintItem` birlikte güncellenir.
- Kullanıcıya görünen metinler `CaptureI18n` üzerinden gelir; yeni metin eklenirse 15 dilin hepsine eklenir (`docs/TRANSLATING.md`).
  Kod yorumları Türkçe, tanımlayıcılar İngilizce.
- Ağ isteği yok. Sayfa adresi ve başlığı yalnız yakalama meta'sında, yerelde saklanır; arayüz yalnız `http(s)`
  adreslerini bağlantı yapar (`CaptureGeometry.siteName`). Gizlilik değişirse `PRIVACY.md` aynı değişiklikte güncellenir.
- Ayar yedeği dışarıdan gelir: `parseBackup` yalnız bilinen anahtarları okur, her değeri doğrular; geçersizse hiçbir şey yazılmaz.
- Renk yuvarlakları (`.swatch`) `chip` sınıfı taşımaz: `.dark .chip` arka planı rengi ezer.
- Ayarlar sayfasındaki bağlantılar (`LINKS`) ve Destek bölümü yalnız gerçek adreslere gider: depo
  `github.com/kilicberkay/CaptureHub`, Sponsors `github.com/sponsors/kilicberkay`. Uydurma URL yazılmaz.
- Görüntüde boyut metni `CaptureGeometry.dimensions` ile yazılır (RTL'de ters dönmesin). Tam sayfa kırpması
  `clientWidth` kullanır (kaydırma çubuğu görüntüye girmez).
