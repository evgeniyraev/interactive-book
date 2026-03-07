const path = require('node:path');
const drivelist = require('drivelist');
const { BrowserWindow } = require('electron');
const { getConfig, setConfig } = require('./configManager');
const { importPackageFromFolder, readExternalManifest } = require('./contentManager');

const SCAN_INTERVAL_MS = 30_000;

class ExternalSyncManager {
  constructor() {
    this.interval = null;
    this.running = false;
    this.lastAttemptedHash = '';
  }

  start() {
    if (this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      this.scanAndSync().catch(() => {
        // Intentionally silent to avoid noisy polling logs for removable drives.
      });
    }, SCAN_INTERVAL_MS);

    this.scanAndSync().catch(() => {});
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async scanAndSync() {
    if (this.running) {
      return;
    }

    const config = getConfig();
    if (!config.autoupdate.detectExternalContent) {
      return;
    }

    this.running = true;
    try {
      const drives = await drivelist.list();
      const removableMounts = drives
        .filter((drive) => drive.isRemovable)
        .flatMap((drive) => drive.mountpoints)
        .map((mount) => mount.path)
        .filter(Boolean);

      for (const mountPath of removableMounts) {
        const manifest = await readExternalManifest(mountPath);
        if (!manifest || !manifest.hash) {
          continue;
        }

        const latestConfig = getConfig();
        const currentHash = latestConfig.autoupdate.lastImportedHash || '';
        if (manifest.hash === currentHash || manifest.hash === this.lastAttemptedHash) {
          continue;
        }

        this.lastAttemptedHash = manifest.hash;
        const result = await importPackageFromFolder(manifest.folderPath);
        setConfig({
          autoupdate: {
            ...result.config.autoupdate,
            lastImportedHash: manifest.hash
          }
        });

        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send('content-updated', {
            source: 'external-drive',
            hash: manifest.hash
          });
        });
      }
    } finally {
      this.running = false;
    }
  }
}

module.exports = {
  ExternalSyncManager
};
