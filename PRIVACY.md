# Privacy policy

CaptureHub is an open-source Chrome extension that takes screenshots and lets you annotate them. It is
designed so that your captures stay on your device.

## What CaptureHub does with data

- **Collects nothing.** CaptureHub does not send any data to the author or to third parties. It has no
  analytics, telemetry, crash reporting, or accounts.
- **Keeps captures locally.** Each screenshot you take is stored in the extension's IndexedDB storage in your
  browser profile, so the editor and the history can open it again. The history keeps the number of captures you
  choose (10, 30 or 100); older captures are deleted automatically. You can delete captures from the history
  page at any time, and removing the extension deletes all of them.
- **Stores settings locally.** Your preferences (theme, language, export format, file name template, delay,
  history limit, last annotation color and size) are kept in `chrome.storage.local` in your browser profile. A
  settings backup is a file you save and open yourself; it contains only these preferences, never captures.
- **Keeps your edits and thumbnails locally.** Marks you add in the editor, the edited image when you crop, heal,
  rotate or resize, and a small thumbnail of each capture are stored in the same local IndexedDB storage, so a capture
  opens where you left it. The original capture is kept unchanged. All of it is deleted with the capture.
- **Stores the source page with each capture, locally.** Each capture records its mode (visible area, full page,
  region or element), its size, the time it was taken, and the address and title of the page it was taken from, so
  you can tell captures apart in the history. This information stays in the same local storage as the capture and is
  deleted with it. If you download a capture, the browser's download id is stored too, so the history can show the
  file in its folder.
- **Acts only when you ask.** CaptureHub captures a page when you choose a capture mode in its toolbar popup or in
  the toolbar icon's right-click menu, or press a shortcut. It reads the page only to measure it, scroll it for full page captures, and draw the
  selection overlay for region and element capture.
- **Exports are files you control.** Copying writes a PNG to your clipboard. Downloading saves a file where your
  browser puts downloads. Nothing is uploaded.

## Permissions and why they are needed

| Permission | Why |
|---|---|
| `activeTab` | Access to the tab you are capturing, granted only when you click the toolbar icon, use its right-click menu, or press a shortcut, and only for that tab. |
| `contextMenus` | Adds the capture modes, History and Settings to the toolbar icon's right-click menu. |
| `downloads` | Saves downloaded captures through the browser's download manager and, when you ask, shows a downloaded file in its folder. CaptureHub reads only the downloads it started. |
| `scripting` | Injects the small scripts that measure the page, scroll it for full page captures, and show the region and element selector. Pages you do not capture run no CaptureHub code. |
| `storage` | Saves your settings and the list of captures locally. |

CaptureHub does not request access to all websites.

## Changes

If this policy changes, the new version is published in this file and in the release notes.
