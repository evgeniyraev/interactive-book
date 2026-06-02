/* global bookApi */

const state = {
  config: null,
  update: {
    checking: false,
    available: false,
    latestVersion: null,
    currentVersion: null,
    progress: null
  }
};

const els = {
  appBackgroundColor: document.getElementById('appBackgroundColor'),
  backgroundImage: document.getElementById('backgroundImage'),
  displacementMap: document.getElementById('displacementMap'),
  pageOffsetX: document.getElementById('pageOffsetX'),
  edgeZoneWidth: document.getElementById('edgeZoneWidth'),
  innerPagePadding: document.getElementById('innerPagePadding'),
  innerPagePaddingY: document.getElementById('innerPagePaddingY'),
  sideViewMaxWidth: document.getElementById('sideViewMaxWidth'),
  sideViewOpacity: document.getElementById('sideViewOpacity'),
  turnAnimationMs: document.getElementById('turnAnimationMs'),
  idleRandomFlipEnabled: document.getElementById('idleRandomFlipEnabled'),
  idleRandomFlipDelaySec: document.getElementById('idleRandomFlipDelaySec'),
  idleRandomFlipIntervalSec: document.getElementById('idleRandomFlipIntervalSec'),
  pageBackground: document.getElementById('pageBackground'),
  pageBackgroundOpacity: document.getElementById('pageBackgroundOpacity'),
  pageWidth: document.getElementById('pageWidth'),
  pageHeight: document.getElementById('pageHeight'),
  settingsHoldSeconds: document.getElementById('settingsHoldSeconds'),
  updatePolicy: document.getElementById('updatePolicy'),
  detectExternalContent: document.getElementById('detectExternalContent'),
  autoCheckOnLaunch: document.getElementById('autoCheckOnLaunch'),
  updateAction: document.getElementById('updateAction'),
  adminServerEnabled: document.getElementById('adminServerEnabled'),
  adminServerPort: document.getElementById('adminServerPort'),
  adminServerState: document.getElementById('adminServerState'),
  adminServerUrl: document.getElementById('adminServerUrl'),
  status: document.getElementById('status')
};

function setStatus(message) {
  els.status.textContent = message;
}

function formatPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) {
    return null;
  }

  return `${Math.max(0, Math.min(100, percent)).toFixed(1)}%`;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function updateProgressText(progress) {
  const percent = formatPercent(progress?.percent);
  const transferred = formatBytes(progress?.transferred);
  const total = formatBytes(progress?.total);
  const speed = formatBytes(progress?.bytesPerSecond);

  const parts = [];
  if (percent) {
    parts.push(percent);
  }

  if (transferred && total) {
    parts.push(`${transferred} of ${total}`);
  }

  if (speed) {
    parts.push(`${speed}/s`);
  }

  return parts.length > 0 ? `Downloading update: ${parts.join(' - ')}` : 'Downloading update...';
}

function renderUpdateAction() {
  if (state.update.checking) {
    els.updateAction.textContent = 'Checking...';
    els.updateAction.disabled = true;
    return;
  }

  if (state.update.installing) {
    els.updateAction.textContent = 'Installing...';
    els.updateAction.disabled = true;
    return;
  }

  if (state.update.downloading) {
    const percent = formatPercent(state.update.progress?.percent);
    els.updateAction.textContent = percent ? `Downloading ${percent}` : 'Downloading...';
    els.updateAction.disabled = true;
    return;
  }

  if (state.update.available) {
    els.updateAction.textContent = state.update.latestVersion
      ? `Update to ${state.update.latestVersion}`
      : 'Update now';
    els.updateAction.disabled = false;
    return;
  }

  els.updateAction.textContent = 'Check updates';
  els.updateAction.disabled = false;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readPrimitiveInputs() {
  state.config.design.appBackgroundColor = els.appBackgroundColor.value || '#101319';
  state.config.design.backgroundImage = els.backgroundImage.value.trim();
  state.config.design.displacementMap = els.displacementMap.value.trim();
  state.config.design.pageOffsetX = Number(els.pageOffsetX.value || 0);
  state.config.design.edgeZoneWidth = Number(els.edgeZoneWidth.value || 92);
  state.config.design.innerPagePadding = Number(els.innerPagePadding.value || 24);
  state.config.design.innerPagePaddingY = Number(els.innerPagePaddingY.value || 24);
  state.config.design.sideViewMaxWidth = Number(els.sideViewMaxWidth.value || 68);
  state.config.design.sideViewOpacity = Number(els.sideViewOpacity.value || 1);
  state.config.design.turnAnimationMs = Number(els.turnAnimationMs.value || 700);
  state.config.design.idleRandomFlipEnabled = Boolean(els.idleRandomFlipEnabled.checked);
  state.config.design.idleRandomFlipDelaySec = Number(els.idleRandomFlipDelaySec.value || 45);
  state.config.design.idleRandomFlipIntervalSec = Number(els.idleRandomFlipIntervalSec.value || 8);
  state.config.design.page.background = els.pageBackground.value || '#ffffff';
  state.config.design.page.backgroundOpacity = Number(els.pageBackgroundOpacity.value || 1);
  state.config.design.page.width = Number(els.pageWidth.value || 900);
  state.config.design.page.height = Number(els.pageHeight.value || 1200);
  state.config.mode.settingsHoldSeconds = Number(els.settingsHoldSeconds.value || 10);

  state.config.autoupdate.policy = els.updatePolicy.value;
  state.config.autoupdate.detectExternalContent = Boolean(els.detectExternalContent.checked);
  state.config.autoupdate.autoCheckOnLaunch = Boolean(els.autoCheckOnLaunch.checked);

  state.config.adminServer.enabled = Boolean(els.adminServerEnabled.checked);
  state.config.adminServer.port = Number(els.adminServerPort.value || 47831);
}

function writePrimitiveInputs() {
  els.appBackgroundColor.value = state.config.design.appBackgroundColor || '#101319';
  els.backgroundImage.value = state.config.design.backgroundImage || '';
  els.displacementMap.value = state.config.design.displacementMap || '';
  els.pageOffsetX.value = String(state.config.design.pageOffsetX ?? 0);
  els.edgeZoneWidth.value = String(state.config.design.edgeZoneWidth ?? 92);
  els.innerPagePadding.value = String(state.config.design.innerPagePadding ?? 24);
  els.innerPagePaddingY.value = String(state.config.design.innerPagePaddingY ?? 24);
  els.sideViewMaxWidth.value = String(state.config.design.sideViewMaxWidth ?? 68);
  els.sideViewOpacity.value = String(state.config.design.sideViewOpacity ?? 1);
  els.turnAnimationMs.value = String(state.config.design.turnAnimationMs ?? 700);
  els.idleRandomFlipEnabled.checked = Boolean(state.config.design.idleRandomFlipEnabled);
  els.idleRandomFlipDelaySec.value = String(state.config.design.idleRandomFlipDelaySec ?? 45);
  els.idleRandomFlipIntervalSec.value = String(state.config.design.idleRandomFlipIntervalSec ?? 8);
  els.pageBackground.value = state.config.design.page.background || '#ffffff';
  els.pageBackgroundOpacity.value = String(state.config.design.page.backgroundOpacity ?? 1);
  els.pageWidth.value = String(state.config.design.page.width ?? 900);
  els.pageHeight.value = String(state.config.design.page.height ?? 1200);
  els.settingsHoldSeconds.value = String(state.config.mode.settingsHoldSeconds ?? 10);
  els.updatePolicy.value = state.config.autoupdate.policy || 'everything';
  els.detectExternalContent.checked = Boolean(state.config.autoupdate.detectExternalContent);
  els.autoCheckOnLaunch.checked = Boolean(state.config.autoupdate.autoCheckOnLaunch);
  els.adminServerEnabled.checked = Boolean(state.config.adminServer?.enabled);
  els.adminServerPort.value = String(state.config.adminServer?.port ?? 47831);
}

function renderServerState(serverStatus) {
  const running = Boolean(serverStatus?.running);
  const url = serverStatus?.url || '';

  els.adminServerState.textContent = running ? 'Running' : 'Stopped';
  els.adminServerState.dataset.running = String(running);
  els.adminServerUrl.textContent = url || 'Start the local admin server to open the browser panel.';
}

async function loadConfig() {
  state.config = clone(await window.bookApi.getConfig());
  writePrimitiveInputs();
  renderServerState(await window.bookApi.getAdminServerStatus());
}

async function checkForUpdates({ silent = false } = {}) {
  state.update = {
    ...state.update,
    checking: true,
    downloading: false,
    installing: false,
    progress: null
  };
  renderUpdateAction();

  try {
    const result = await window.bookApi.checkForUpdates();
    state.update = {
      checking: false,
      downloading: false,
      installing: false,
      available: Boolean(result.available),
      latestVersion: result.latestVersion || null,
      currentVersion: result.currentVersion || null,
      progress: null
    };

    if (result.available) {
      setStatus(`Update available: ${result.latestVersion}`);
    } else if (!silent) {
      setStatus(result.reason || 'No update available.');
    }

    return result;
  } catch (error) {
    state.update = {
      ...state.update,
      checking: false,
      downloading: false,
      installing: false,
      available: false,
      progress: null
    };
    setStatus(error.message || 'Could not check for updates.');
    return { available: false, reason: error.message };
  } finally {
    renderUpdateAction();
  }
}

async function applyUpdate() {
  state.update = {
    ...state.update,
    downloading: true,
    installing: false,
    progress: null
  };
  renderUpdateAction();
  setStatus('Downloading update...');

  try {
    const result = await window.bookApi.applyUpdate();
    if (!result.available) {
      state.update = {
        checking: false,
        downloading: false,
        installing: false,
        available: false,
        latestVersion: result.latestVersion || null,
        currentVersion: result.currentVersion || null,
        progress: null
      };
      setStatus(result.reason || 'No update available.');
      return result;
    }

    if (result.ok === false) {
      state.update = {
        ...state.update,
        downloading: false,
        installing: false,
        available: true,
        latestVersion: result.latestVersion || state.update.latestVersion,
        currentVersion: result.currentVersion || state.update.currentVersion,
        progress: null
      };
      setStatus(result.message || 'Could not download update.');
      return result;
    }

    state.update = {
      ...state.update,
      downloading: false,
      installing: true,
      available: true,
      latestVersion: result.latestVersion || state.update.latestVersion,
      currentVersion: result.currentVersion || state.update.currentVersion,
      progress: null
    };
    setStatus(result.message || 'Update downloaded. Installing now.');
    return result;
  } catch (error) {
    state.update = {
      ...state.update,
      downloading: false,
      installing: false,
      progress: null
    };
    setStatus(error.message || 'Could not install update.');
    return { ok: false, message: error.message };
  } finally {
    renderUpdateAction();
  }
}

async function saveConfig() {
  readPrimitiveInputs();
  state.config = clone(await window.bookApi.setConfig(state.config));
  writePrimitiveInputs();
  renderServerState(await window.bookApi.getAdminServerStatus());
  setStatus('Settings saved.');
}

async function pickAssetAndAssign(kind) {
  const result = await window.bookApi.pickAsset(kind);
  if (result.canceled) {
    return;
  }

  if (kind === 'background') {
    state.config.design.backgroundImage = result.relativePath;
    els.backgroundImage.value = result.relativePath;
  }

  if (kind === 'displacement-map') {
    state.config.design.displacementMap = result.relativePath;
    els.displacementMap.value = result.relativePath;
  }

}

function bindEvents() {
  document.querySelectorAll('[data-pick]').forEach((button) => {
    button.addEventListener('click', async () => {
      await pickAssetAndAssign(button.dataset.pick);
    });
  });

  document.querySelectorAll('[data-clear]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.clear === 'background') {
        state.config.design.backgroundImage = '';
        els.backgroundImage.value = '';
        setStatus('Background image cleared. Save to apply.');
      }
    });
  });

  document.getElementById('saveAll').addEventListener('click', saveConfig);

  document.getElementById('openAdminPanel').addEventListener('click', async () => {
    readPrimitiveInputs();
    state.config = clone(await window.bookApi.setConfig(state.config));
    const serverStatus = await window.bookApi.openAdminPanel();
    renderServerState(serverStatus);
    setStatus('Admin panel opened in the browser.');
  });

  els.updateAction.addEventListener('click', async () => {
    if (state.update.available) {
      await applyUpdate();
      return;
    }

    await checkForUpdates();
  });

  document.getElementById('exportPackage').addEventListener('click', async () => {
    await saveConfig();
    const result = await window.bookApi.exportPackage();
    if (result.canceled) {
      setStatus('Export canceled.');
      return;
    }

    setStatus(`Exported with hash ${result.hash.slice(0, 12)}...`);
  });

  document.getElementById('importPackage').addEventListener('click', async () => {
    const result = await window.bookApi.importPackage();
    if (result.canceled) {
      setStatus('Import canceled.');
      return;
    }

    await loadConfig();
    setStatus('Imported settings and content package.');
  });

  window.bookApi.onUpdateDownloaded((payload) => {
    setStatus(`Update ${payload.version} downloaded. Installing now.`);
  });

  window.bookApi.onUpdateDownloadProgress((payload) => {
    state.update = {
      ...state.update,
      downloading: true,
      progress: payload
    };
    renderUpdateAction();
    setStatus(updateProgressText(payload));
  });

  window.bookApi.onAdminServerStateChanged((payload) => {
    renderServerState(payload);
  });
}

async function bootstrap() {
  bindEvents();
  await loadConfig();
  await checkForUpdates({ silent: true });
}

bootstrap();
