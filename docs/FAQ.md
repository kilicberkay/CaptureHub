# FAQ

## Why does a page say it cannot be captured?

Chrome does not let extensions capture its own pages (`chrome://`, the Chrome Web Store, other extensions' pages,
`view-source:`). Local files (`file://`) work only after you turn on **Allow access to file URLs** for CaptureHub
at `chrome://extensions`.

## The shortcuts do not work.

Chrome assigns an extension's suggested shortcuts only when it is installed, and only if no other extension uses
them. Open **Settings → Shortcuts** in CaptureHub to see what is assigned, and **Open shortcut settings** to change
them at `chrome://extensions/shortcuts`. If you loaded an earlier version unpacked, remove it and load it again to
get the defaults (Alt+Shift+V, Alt+Shift+F, Alt+Shift+R, Alt+Shift+E).

## Why is a full page capture cut off at the bottom?

Very long pages are cut at 16,000 pixels, because larger images are slow to edit and some browsers cannot draw them.
The editor tells you when this happened. Capture the rest with a second full page capture after scrolling, or with
region capture.

## A sticky header appears in the middle of my full page capture.

CaptureHub hides fixed and sticky elements while it scrolls, and shows the top ones only in the first slice and the
bottom ones only in the last. Pages that build their header with scripts that react to scrolling can still slip
through. Region capture of the part you need is the workaround.

## Where are my captures stored? Are they uploaded?

They stay in your browser, in the extension's local storage (IndexedDB). Nothing is uploaded, and CaptureHub makes
no network requests. The history keeps 10, 30, or 100 captures (your choice); older ones are deleted automatically.
Removing the extension deletes all of them. See [PRIVACY.md](../PRIVACY.md).

## Why does CaptureHub need the "downloads" permission?

To save files through Chrome's download manager and, when you choose **Show in folder** in the history, to open the
folder with the file selected. CaptureHub only looks up downloads it started itself.

## Does the settings backup include my captures?

No. It is a small JSON file with your preferences only (theme, language, format, quality, file name template,
delay, history limit, last color and size). Importing checks every value and changes nothing if the file is not valid.

## Can I use it in Edge, Brave, or other Chromium browsers?

Yes, any Chromium-based browser that supports Manifest V3 and Chrome 116 APIs should work. The tests run on Chromium.
