# Chrome Web Store package

This folder holds what goes into the Chrome Web Store listing. It is not part of the extension package.

| What | File |
|---|---|
| Listing text, 15 languages (English is the default); file names match `extension/_locales/` | `listing/<locale>.md` |
| Store icon, 128×128 (96 px artwork with a 16 px transparent border) | `assets/store-icon-128.png` |
| Small promo tile, 440×280, one per language | `assets/promo/<locale>/promo-small-440x280.png` |
| Marquee promo tile, 1400×560, one per language | `assets/promo/<locale>/promo-marquee-1400x560.png` |
| GitHub social preview, 1280×640 (English, set in the repository settings) | `assets/social-preview-1280x640.png` |
| Screenshots, 1280×800, five per language | `assets/screenshots/<locale>/` |

`<locale>` is one of the folders in `extension/_locales/`. The images are made from the real extension with
`npm run images` (`tools/make-store-assets.mjs`); it needs Chromium, and the machine needs fonts for every script
the languages use (CJK, Arabic, Devanagari, Bengali). The privacy policy is `PRIVACY.md` at the repository root.

## Publishing

1. Build the package: `npm run build` → `dist/capturehub-<version>.zip`.
2. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), open the existing item
   (do not create a new one) and upload the zip.
3. Fill in the listing from `listing/en.md`; for every other language, paste the summary and description from
   `listing/<locale>.md`.
4. Upload the icon (`assets/store-icon-128.png`), the promo images from `assets/promo/<locale>/` and the screenshots
   from `assets/screenshots/<locale>/` to that language's listing. The social preview is for the GitHub repository
   settings and is not uploaded to the store.
5. In **Privacy practices**, state that no data is collected or sold and no remote code is used. Copy the permission
   justifications from `listing/en.md` and `listing/tr.md`; the privacy policy URL is
   `https://github.com/kilicberkay/CaptureHub/blob/main/PRIVACY.md`.
6. Submit for review. The package uses only `activeTab`, `contextMenus`, `downloads`, `scripting`, and `storage`, and
   does not ask for access to all sites.

## Before every submission

- `npm test` passes.
- `npm run build` works; the zip contains every file listed in `tools/build.js`.
- The version in `extension/manifest.json` is higher than the published store version.
- The listing matches the current features.
- Screenshots show the current interface.
- Each `listing/<locale>.md` summary matches `extDescription` in `extension/_locales/<locale>/messages.json`.
- The privacy policy link points to the repository and returns 200.
