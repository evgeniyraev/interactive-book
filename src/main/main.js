const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain } = require('electron');
const {
  getConfig,
  setConfig,
  ensureDataDirectories
} = require('./configManager');
const {
  pickFileAndCopy,
  copyManyFilesToAssets,
  copyManyBuffersToAssets,
  resolveDataPath,
  exportPackage,
  importPackageByDialog
} = require('./contentManager');
const { UpdateManager } = require('./updateManager');
const { ExternalSyncManager } = require('./externalSyncManager');

const isDev = process.env.NODE_ENV !== 'production';
let mainWindow = null;
let settingsWindow = null;

const updateManager = new UpdateManager();
const externalSyncManager = new ExternalSyncManager();

function notifyWindows(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function createMainWindow() {
  const config = getConfig();

  mainWindow = new BrowserWindow({
    width: isDev ? 1440 : 1920,
    height: isDev ? 900 : 1080,
    fullscreen: !isDev,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    createSettingsWindow();
  }

  if (!isDev && config.autoupdate.autoCheckOnLaunch) {
    updateManager.checkForUpdates().then((result) => {
      if (result.available) {
        updateManager.downloadUpdate().then(() => {
          notifyWindows('update-downloaded', { version: result.latestVersion });
        });
      }
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 1100,
    height: 840,
    resizable: isDev,
    autoHideMenuBar: true,
    title: 'Interactive Book Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

function startOrStopExternalSync() {
  const config = getConfig();
  if (config.autoupdate.detectExternalContent) {
    externalSyncManager.start();
  } else {
    externalSyncManager.stop();
  }
}

function registerIpcHandlers() {
  ipcMain.handle('config:get', () => getConfig());

  ipcMain.handle('config:set', (_, partialConfig) => {
    const config = setConfig(partialConfig);
    startOrStopExternalSync();
    notifyWindows('content-updated', { source: 'settings-save' });
    return config;
  });

  ipcMain.handle('settings:open', () => {
    createSettingsWindow();
    return { ok: true };
  });

  ipcMain.handle('asset:pick', async (_, kind) => {
    const imageFilter = {
      name: 'Images',
      extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif']
    };

    const filters = kind === 'displacement-map' ? [imageFilter] : [imageFilter];
    const relativePath = await pickFileAndCopy({ filters });

    return {
      canceled: !relativePath,
      relativePath: relativePath || ''
    };
  });

  ipcMain.handle('asset:resolve', async (_, relativePath) => {
    if (!relativePath) {
      return '';
    }

    return pathToFileURL(resolveDataPath(relativePath)).toString();
  });

  ipcMain.handle('asset:import-paths', async (_, filePaths) => {
    const safePaths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
    return copyManyFilesToAssets(safePaths);
  });

  ipcMain.handle('asset:import-files', async (_, files) => {
    const safeFiles = Array.isArray(files) ? files : [];
    return copyManyBuffersToAssets(safeFiles);
  });

  ipcMain.handle('package:export', () => exportPackage());

  ipcMain.handle('package:import', async () => {
    const result = await importPackageByDialog();
    if (!result.canceled) {
      notifyWindows('content-updated', { source: 'import' });
    }

    return result;
  });

  ipcMain.handle('updates:check', () => updateManager.checkForUpdates());
  ipcMain.handle('updates:download', () => updateManager.downloadUpdate());
  ipcMain.handle('updates:install', () => {
    updateManager.installDownloadedUpdate();
    return { ok: true };
  });
}

app.whenReady().then(async () => {
  await ensureDataDirectories();
  registerIpcHandlers();
  createMainWindow();
  startOrStopExternalSync();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
