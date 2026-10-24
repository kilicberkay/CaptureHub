# Contributing to CaptureHub

Thanks for helping! CaptureHub is a small Chrome extension (Manifest V3) with no build step and no runtime
dependencies. Contributions of all sizes are welcome: bug reports, translations, and code.

## Ground rules

- Be kind. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Keep the extension dependency-free at runtime. npm is used only for tests, packaging, and image tools.
- Do not add network requests, remote scripts, analytics, or new permissions without an issue first. Privacy is a
  core promise (see [PRIVACY.md](../PRIVACY.md)); any change that stores or handles user data updates it too.
- Interface text lives in `extension/shared/i18n.js` and is translated into all 15 languages
  (see [TRANSLATING.md](../docs/TRANSLATING.md)).
- A change in logic comes with at least one test.

## Development

Requirements: Node.js 20 or newer. The browser tests need Chromium (see the README).

```bash
npm test             # every check, including the browser tests
npm run test:quick   # every check except the browser tests
npm run check        # syntax check of every JavaScript file
npm run build        # dist/capturehub-<version>.zip
```

To try the extension by hand, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and
select the `extension/` folder.

## Pull requests

1. Open an issue first, except for small fixes.
2. Work on a short-lived branch.
3. Make sure `npm test` passes.
4. Describe what changed and how you checked it. The pull request template has a checklist.

## Project notes

The architecture is described in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). `AGENTS.md` holds the invariants
that every change must keep (capture rate limit, instant scrolling, the selector overlay never appearing in a capture).
