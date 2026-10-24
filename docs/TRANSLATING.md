# Translating CaptureHub

CaptureHub's interface is translated into 15 languages. Translations are a great first contribution, and this
guide explains how the strings are organized.

## Files

| What | File |
|---|---|
| Interface text (popup, editor, settings) | `extension/shared/i18n.js` (the `TABLE` object) |
| Extension name, store description, toolbar tooltip, shortcut and right-click menu titles | `extension/_locales/<language>/messages.json` |

Folder and table codes follow Chrome's convention: `pt_BR`, `zh_CN`. Every language has exactly the same keys as
English; the unit tests check this.

## Improving a translation

1. Find the English text in `extension/shared/i18n.js` and note its key.
2. Change the value of that key in your language's table.
3. Keep placeholders such as `{n}`, `{name}`, `{error}`, and `{version}` exactly as they are.
4. Run `npm run test:quick`.

## Adding a language

1. Add a table to `TABLE` in `extension/shared/i18n.js` and translate every English key.
2. Create `extension/_locales/<language>/messages.json` with these keys: `extName`, `extDescription` (at most 132
   characters), `actionTitle`, `cmdVisible`, `cmdFull`, `cmdRegion`, `cmdElement`, `menuHistory`, `menuSettings`.
3. Add the language's own name to `LANGUAGE_NAMES` in `extension/options/options.js`.
4. Run `npm test`. `tests/unit/i18n.test.js` checks the keys, the placeholders, and the `_locales` folders.

## Guidelines

- Keep button labels short; they may wrap on narrow screens.
- Tool shortcut letters (V, R, A, T, B, N, H, C) are not part of the translation; the code adds them to the tooltips.
- The file name template tokens `{date}` and `{mode}` stay in English; people type them by hand.
- Right-to-left languages (`ar`, `ur`) get `dir="rtl"` automatically. A new right-to-left language must also be
  added to `RTL_LANGUAGES` in `i18n.js`.
