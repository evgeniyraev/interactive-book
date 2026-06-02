const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const {
  getConfig,
  setConfig,
  ensureDataDirectories
} = require('./configManager');
const {
  pickFileAndCopy,
  copyManyFilesToAssets,
  copyManyBuffersToAssets,
  readAssetBuffer,
  resolveDataPath,
  exportPackage,
  importPackageByDialog
} = require('./contentManager');
const { UpdateManager } = require('./updateManager');
const { ExternalSyncManager } = require('./externalSyncManager');
const { AdminServer } = require('./adminServer');

const isDev = !app.isPackaged;
let mainWindow = null;
let settingsWindow = null;

const updateManager = new UpdateManager();
const externalSyncManager = new ExternalSyncManager();
const adminServer = new AdminServer({
  onContentSaved: () => {
    notifyWindows('content-updated', { source: 'admin-panel-save' });
  },
  onStateChanged: (payload) => {
    notifyWindows('admin-server-state', payload);
  }
});

async function checkDownloadAndInstallUpdate() {
  const checkResult = await updateManager.checkForUpdates();
  if (!checkResult.available) {
    return checkResult;
  }

  const downloadResult = await updateManager.downloadUpdate();
  if (!downloadResult.ok) {
    return {
      ...checkResult,
      ok: false,
      message: downloadResult.message
    };
  }

  updateManager.installDownloadedUpdate();
  return {
    ...checkResult,
    ok: true,
    installing: true,
    message: 'Update downloaded. Installing now.'
  };
}

function notifyWindows(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function getAdminServerPort() {
  const configured = Number(getConfig().adminServer?.port);
  if (Number.isFinite(configured) && configured >= 1024 && configured <= 65535) {
    return configured;
  }

  return 47831;
}

async function startOrStopAdminServer(forceStart = false) {
  const config = getConfig();
  const shouldRun = forceStart || Boolean(config.adminServer?.enabled);

  if (shouldRun) {
    return adminServer.start(getAdminServerPort());
  }

  await adminServer.stop();
  return { url: '', port: null };
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
    checkDownloadAndInstallUpdate().catch((error) => {
      log.error('Automatic update failed', error);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }
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

function createSettingsMenuItem() {
  return {
    label: 'Settings...',
    accelerator: 'CmdOrCtrl+,',
    click: () => {
      createSettingsWindow();
    }
  };
}

function setupApplicationMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              createSettingsMenuItem(),
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : [
          {
            label: 'File',
            submenu: [
              createSettingsMenuItem(),
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]),
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
    startOrStopAdminServer().catch(() => {});
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

  ipcMain.handle('asset:read', async (_, relativePath) => {
    const buffer = await readAssetBuffer(relativePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
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
  ipcMain.handle('updates:apply', () => checkDownloadAndInstallUpdate());
  ipcMain.handle('updates:install', () => {
    updateManager.installDownloadedUpdate();
    return { ok: true };
  });

  ipcMain.handle('admin-server:get-status', () => ({
    running: adminServer.isRunning(),
    url: adminServer.getUrl(),
    port: getAdminServerPort()
  }));

  ipcMain.handle('admin-server:open', async () => {
    const status = await startOrStopAdminServer(true);
    await shell.openExternal(`${status.url}/admin/`);
    return {
      running: true,
      ...status
    };
  });
}

app.whenReady().then(async () => {
  const { createdConfig } = await ensureDataDirectories();
  registerIpcHandlers();
  setupApplicationMenu();
  createMainWindow();

  if (!isDev && createdConfig) {
    createSettingsWindow();
  }

  startOrStopExternalSync();
  await startOrStopAdminServer(process.argv.includes('--admin-server'));

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

app.on('before-quit', () => {
  adminServer.stop().catch(() => {});
});
