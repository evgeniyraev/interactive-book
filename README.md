# InteractiveBook (Electron + Node.js)

Desktop fullscreen interactive book app with two runtime modes:

- Production mode: fullscreen.
- Development mode: windowed, DevTools opened, settings window opened.

## Features implemented

- Interactive page-turning viewer with configurable animation duration.
- Two-page spread layout with drag-to-turn page flip (edge grab + bend/fold effect).
- Settings window with sections:
  - `design`: background, displacement map, page offset, page styling, page size, hold duration.
  - `content`: add/reorder/remove text/image pages.
  - `autoupdate`: update policy (`everything`, `minor`, `patch`), removable-drive sync toggle, export/import package.
- Hidden settings trigger in the viewer: hold top-left corner for `10` seconds (configurable).
- Auto-update integration via GitHub Releases using `electron-updater`.
- Removable drive sync support:
  - Detects `interactive-book-export` package on removable media.
  - Imports automatically when the package hash is different.

## Project layout

- `src/main/main.js`: Electron lifecycle, windows, IPC.
- `src/main/preload.js`: secure renderer API.
- `src/main/configManager.js`: persisted config + hash.
- `src/main/contentManager.js`: asset copy, export/import.
- `src/main/updateManager.js`: update policy filtering + updater hooks.
- `src/main/externalSyncManager.js`: removable-drive polling and import.
- `src/renderer/index.html`: fullscreen viewer.
- `src/renderer/settings.html`: settings UI.

## Local run

```bash
npm install
npm run dev
```

For production-style run:

```bash
npm start
```

## GitHub build and release

Workflow: `.github/workflows/build.yml`

- Triggered on tags matching `v*` and manual dispatch.
- Builds for macOS, Linux, and Windows.
- Publishes artifacts to GitHub Releases via `GH_TOKEN`.

Repository in `package.json` must point to your actual GitHub repo:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/<owner>/<repo>.git"
}
```

Then create and push a tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Notes

- Asset paths are copied into app-local storage (`userData/book-data/assets`) for stable runtime usage.
- External sync expects package format created by the app export button (`interactive-book-export`).
