# Changelog

All notable changes to CaptureHub are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-10-24

First public release. It includes everything below, plus the changes in this section.

### Added
- Support page in the settings (GitHub Sponsors, star, report an issue) and links to the privacy policy and source code.
- Right-click menu on the toolbar icon: visible area, full page, region, element, History and Settings.
- Default shortcuts for all four modes that do not clash with FillHub: Alt+Shift+V (visible), Alt+Shift+F (full page),
  Alt+Shift+R (region), Alt+Shift+E (element).
- History shows the title and site of the page each capture came from, can be searched, and can show a downloaded
  file in its folder.
- Editor: red and blue presets, a custom color picker, five sizes (XS, S, M, L, XL); the last color and size are remembered.
- Settings: export and import settings as a file, reset to defaults, a "System" theme that follows the operating
  system, and a live list of the current shortcuts.

### Changed
- Settings page: status messages appear as a small notice in the corner; sliders and links use the brand color in both themes.
- Theme changes apply at once to every open CaptureHub page, and pages open in the right theme without a dark flash.
- Downloads go through the browser's download manager (new `downloads` permission).

### Fixed
- Text tool: the text box closed as soon as it opened, so no text could be added.
- Element capture did nothing when a region selection was still open on the page (for example, left without Esc):
  the new selector exited early and the old region overlay stayed. A new selection now replaces the old one.
  Clicking without moving the mouse first also works.
- Color swatches looked empty in the dark theme.
- Full page captures no longer repeat the page's vertical scrollbar down the right edge.
- Changing the size of a selected number marker or text now resizes it.
- Lowering the history limit removes the extra captures at once, instead of at the next capture.
- Typing in the editor's format box no longer switches tools.
- Region selection dims the page as soon as it starts, before the first drag.
- Arabic and Urdu: image sizes (1280×713) and delay labels read correctly from right to left.
- Toolbar popup: no horizontal scrollbar with a long list, and the rows line up.
- Tab titles of the editor and settings follow the interface language.

## [0.2.0] - 2026-10-24

### Added
- Element capture: click any element on the page to capture its box.
- Delay before visible area and full page captures (0, 3, 5 or 10 seconds), shown as a countdown on the toolbar badge.
- Full page capture keeps fixed and sticky headers and footers at the top and bottom of the image only, and captures
  a single scrollable container when the window itself does not scroll.
- Editor tools: select and move (with handles, arrow-key nudges), numbered markers, highlighter, crop, S/M/L sizes.
- Undo and redo for every change, including crop.
- Export as PNG, JPEG or WebP, with a file name template and quality setting.
- Settings page: theme, language, export defaults, delay, history size, history management.
- Interface in 15 languages, following the browser language by default.
- Captures that were cut at 16000 px are marked, and the editor says so.

### Changed
- The history keeps the number of captures chosen in settings (10, 30 or 100) instead of a fixed 30.

## [0.1.0] - 2026-10-24

### Added
- Visible area capture, full page capture (scroll and stitch) and region capture (Ctrl+Shift+S, Esc cancels).
- Editor tab with rectangle, arrow, text and pixel blur tools, undo, copy to clipboard and PNG download.
- Local history of the last 30 captures, listed in the toolbar popup.
- Light and dark themes that match FillHub's design tokens.
