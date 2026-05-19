# InteractiveBook (Electron + Node.js)

Desktop fullscreen interactive book app with two runtime modes:

- Production mode: fullscreen.
- Development mode: windowed, DevTools opened, settings window opened.

## Features implemented

- Interactive page-turning viewer with configurable animation duration.
- Two-page spread layout with drag-to-turn page flip (edge grab + bend/fold effect).
- Settings window with sections:
  - `design`: background, displacement map, page offset, page styling, page size, hold duration.
  - `admin panel`: local server toggle, port, open-browser shortcut.
  - `autoupdate`: update policy (`everything`, `minor`, `patch`), removable-drive sync toggle, export/import package.
- Local admin web panel:
  - drag-and-drop PDF upload for turning a finished PDF into the active flipbook
  - rich WYSIWYG page editing powered by Quill
  - inline images with wrap-left, wrap-right, centered, or no-wrap layout
  - intentional page breaks inside rich content
  - everyone who can log in can edit content
  - writer/admin/superadmin permission split for user management
- Runtime pagination of rich content into book pages so long text can continue across multiple pages in the app.
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
- `src/main/adminServer.js`: local Express server for the admin panel.
- `src/main/userManager.js`: local admin/editor user storage and password hashing.
- `src/main/updateManager.js`: update policy filtering + updater hooks.
- `src/main/externalSyncManager.js`: removable-drive polling and import.
- `src/admin/*`: browser admin panel.
- `src/renderer/index.html`: fullscreen viewer.
- `src/renderer/settings.html`: settings UI.

## Local run

```bash
npm install
npm run dev
```

Run with the admin server forced on:

```bash
npm run dev:admin
```

Development runs compile a built-in superadmin with credentials `admin` / `admin` unless overridden in the environment.

Clear local saved app data, including stored config, assets, imported books, and local admin/editor users:

```bash
npm run clear:data
```

Preview the directories before deleting them:

```bash
npm run clear:data -- --dry-run
```

For production-style run:

```bash
npm start
```

Or:

```bash
npm run start:admin
```

You can also enable the admin server from the desktop settings window and then use the "Open admin panel" button.

## User roles

- `writer`: can log in and edit content.
- `admin`: can create and manage writers.
- `superadmin`: can create and manage admins and writers. This account is compiled from environment variables and is not editable from the admin UI.

Production builds expect these environment variables during the build step:

```bash
INTERACTIVE_BOOK_SUPERADMIN_USERNAME
INTERACTIVE_BOOK_SUPERADMIN_PASSWORD
INTERACTIVE_BOOK_SUPERADMIN_DISPLAY_NAME
```

## GitHub build and release

Workflow: `.github/workflows/build.yml`

- Triggered on tags matching `v*` and manual dispatch.
- Currently builds the Windows release from `windows-latest`.
- Creates a GitHub Release automatically for tag pushes and uploads the built artifacts to that release.

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
