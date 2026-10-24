# Chrome Web Store package

This folder holds what goes into the Chrome Web Store listing. It is not part of the extension package.

| What | File |
|---|---|
| Listing text (English is the default language) | `listing/en.md`, `listing/tr.md` |
| Store icon, 128×128 (96 px artwork with a 16 px transparent border) | `assets/store-icon-128.png` |
| Small promo tile, 440×280 | `assets/promo-small-440x280.png` |
| Marquee promo tile, 1400×560 | `assets/promo-marquee-1400x560.png` |
| GitHub social preview, 1280×640 | `assets/social-preview-1280x640.png` |
| Screenshots, 1280×800 | `assets/screenshots/en/`, `assets/screenshots/tr/` |

The images are made from the real extension with `npm run images` (`tools/make-store-assets.mjs`); it needs
Chromium only. The privacy policy is `PRIVACY.md` at the repository root.

## Publishing

1. Build the package: `npm run build` → `dist/capturehub-<version>.zip`.
2. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), create a new item
   and upload the zip.
3. Fill in the listing from `listing/en.md`, and add the Turkish listing from `listing/tr.md`.
4. In **Privacy practices**, state that no data is collected or sold and no remote code is used. Copy the permission
   justifications from the listing file.
5. Submit. The package uses only `activeTab`, `contextMenus`, `downloads`, `scripting`, and `storage`, and does not
   ask for access to all sites.

## Before every submission

- `npm test` passes.
- `npm run build` works; the zip contains every file listed in `tools/build.js`.
- The version in `extension/manifest.json` is higher than the published store version.
- The listing matches the current features.
- The privacy policy link points to the repository and returns 200.
