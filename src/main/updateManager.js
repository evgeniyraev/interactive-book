const { app, BrowserWindow } = require('electron');
const log = require('electron-log');
const semver = require('semver');
const { autoUpdater } = require('electron-updater');
const { getConfig } = require('./configManager');

function isAllowedByPolicy(currentVersion, targetVersion, policy) {
  if (!semver.valid(currentVersion) || !semver.valid(targetVersion)) {
    return false;
  }

  if (!semver.gt(targetVersion, currentVersion)) {
    return false;
  }

  switch (policy) {
    case 'patch':
      return semver.diff(currentVersion, targetVersion) === 'patch';
    case 'minor': {
      const diff = semver.diff(currentVersion, targetVersion);
      return diff === 'patch' || diff === 'minor';
    }
    case 'everything':
    default:
      return true;
  }
}

class UpdateManager {
  constructor() {
    this.lastCheck = null;
    this.latestAllowedVersion = null;

    autoUpdater.autoDownload = false;
    autoUpdater.logger = log;

    autoUpdater.on('update-downloaded', (info) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('update-downloaded', {
          version: info.version
        });
      });
    });
  }

  async checkForUpdates() {
    try {
      const config = getConfig();
      const policy = config.autoupdate.policy;
      const currentVersion = app.getVersion();

      const checkResult = await autoUpdater.checkForUpdates();
      const updateInfo = checkResult?.updateInfo;

      this.lastCheck = {
        at: new Date().toISOString(),
        currentVersion,
        latestVersion: updateInfo?.version || null
      };

      if (!updateInfo?.version) {
        return {
          available: false,
          reason: 'No release metadata available.'
        };
      }

      const allowed = isAllowedByPolicy(currentVersion, updateInfo.version, policy);
      if (!allowed) {
        return {
          available: false,
          reason: `Latest release ${updateInfo.version} does not match policy ${policy}.`,
          blockedByPolicy: true,
          latestVersion: updateInfo.version,
          currentVersion
        };
      }

      this.latestAllowedVersion = updateInfo.version;
      return {
        available: semver.gt(updateInfo.version, currentVersion),
        latestVersion: updateInfo.version,
        currentVersion
      };
    } catch (error) {
      return {
        available: false,
        reason: error.message
      };
    }
  }

  async downloadUpdate() {
    try {
      await autoUpdater.downloadUpdate();
      return {
        ok: true,
        message: 'Update downloaded. Install when ready.'
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  }

  installDownloadedUpdate() {
    autoUpdater.quitAndInstall();
  }
}

module.exports = {
  UpdateManager,
  isAllowedByPolicy
};
