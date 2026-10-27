# Chrome Web Store listing: CaptureHub (English)

**Name:** CaptureHub

**Summary (132 characters max):**
Capture the visible area, a full page, a region or an element, then annotate with arrows, boxes and pixelation.

**Category:** Productivity

**Language:** English (default); localized summary and description in 14 more languages, one file each (`<locale>.md`)

**Single purpose:** Take screenshots of the current web page and annotate them.

## Description

CaptureHub takes screenshots of web pages in four capture modes and includes an annotation editor for marking them up before you copy or save them.

Highlights

- Four capture modes: visible area, full page, region and element. Regions and elements taller than the screen are captured in full. Full page capture scrolls the page and stitches the parts into a single image. Fixed headers and footers appear only once, at the top and bottom of the image.
- Annotation editor with box, ellipse, arrow, pen, text, pixelation, highlighter, numbered marker and crop tools. Seven preset colors, a custom color and an eyedropper; five sizes (XS to XL) for lines, text and brushes. Annotations can be selected and moved, and every change can be undone and redone.
- The spot healing brush and content-aware fill remove text, icons and other unwanted details from a screenshot. The image can also be rotated and resized.
- Copy to the clipboard or save as PNG, JPEG or WebP.
- Keyboard shortcuts for each capture mode: Alt+Shift+V (visible area), Alt+Shift+F (full page), Alt+Shift+R (region) and Alt+Shift+E (element). The right-click menu on the toolbar icon gives access to the capture modes, the history and the settings.
- Optional delay before visible area and full page captures, so that menus and tooltips can be opened first.
- History of your recent captures, stored on your device with the page title and site of each capture. You can search the history, reopen a capture in the editor or show a downloaded file in its folder.
- Settings backup (export and import), reset to default settings, 15 interface languages, and a light, dark or system theme.
- No account is required. CaptureHub collects no data, uses no analytics and makes no network requests. Captures, history and settings are stored only on your device; nothing is uploaded.

How to use

1. Open the page you want to capture.
2. Press Alt+Shift+V for the visible area, Alt+Shift+F for the full page, Alt+Shift+R for a region or Alt+Shift+E for an element. The toolbar popup and the right-click menu on the toolbar icon offer the same four modes, plus History and Settings.
3. Mark the capture up in the editor, then copy it or save it as PNG, JPEG or WebP.

On macOS the shortcuts are Option+Shift+…; change them at chrome://extensions/shortcuts.

Privacy

CaptureHub collects no data, uses no analytics and makes no network requests. Captures, history and settings stay on your device. Privacy policy: https://github.com/kilicberkay/CaptureHub/blob/main/PRIVACY.md

Open source

CaptureHub is free and open source under the MIT license. Source code, issues and contributions: https://github.com/kilicberkay/CaptureHub

Support

CaptureHub is free. If CaptureHub is useful in your work, you can support its development on GitHub Sponsors: https://github.com/sponsors/kilicberkay

## Permission justifications

- **activeTab:** Used when you click the toolbar icon, press a shortcut or choose a capture mode, so CaptureHub can
  capture the tab you are viewing. No access to other sites.
- **scripting:** Used to measure the page, scroll it for full page captures, and show the region and element
  selector on the page you are capturing.
- **storage:** Used to save your settings and your local capture history.
- **contextMenus:** Adds the capture modes, History and Settings to the toolbar icon's right-click menu.
- **downloads:** Saves edited captures through the browser's download manager and shows a downloaded capture in its
  folder when you ask from the history.

## Screenshots

Captions (in order):

1. Editor with a box, an arrow, text, numbered markers, a highlighted row and a pixelated e-mail address.
2. Region selection in progress, with the page dimmed and the selection size shown.
3. Element selection highlighting a chart card.
4. General settings: theme, language, format, quality, file name, delay, history size, backup and reset.
5. History listing captures with page title, site, open, show in folder and delete.

## Assets

- Icon: `store/assets/store-icon-128.png`
- Small promo tile: `store/assets/promo/<locale>/promo-small-440x280.png`
- Marquee: `store/assets/promo/<locale>/promo-marquee-1400x560.png`
- GitHub social preview: `store/assets/social-preview-1280x640.png`
- Screenshots (1280×800): `store/assets/screenshots/<locale>/`

## Privacy

See `PRIVACY.md` in the repository. CaptureHub collects no data.
