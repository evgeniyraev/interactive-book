/* global bookApi */

const state = {
  config: null
};

const els = {
  backgroundImage: document.getElementById('backgroundImage'),
  displacementMap: document.getElementById('displacementMap'),
  pageOffsetX: document.getElementById('pageOffsetX'),
  turnAnimationMs: document.getElementById('turnAnimationMs'),
  pageBackground: document.getElementById('pageBackground'),
  pageWidth: document.getElementById('pageWidth'),
  pageHeight: document.getElementById('pageHeight'),
  settingsHoldSeconds: document.getElementById('settingsHoldSeconds'),
  pagesList: document.getElementById('pagesList'),
  dropImagesZone: document.getElementById('dropImagesZone'),
  updatePolicy: document.getElementById('updatePolicy'),
  detectExternalContent: document.getElementById('detectExternalContent'),
  autoCheckOnLaunch: document.getElementById('autoCheckOnLaunch'),
  status: document.getElementById('status')
};

function setStatus(message) {
  els.status.textContent = message;
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `page-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePage(rawPage) {
  const hasLegacyTitle = rawPage?.type !== 'image' && rawPage?.title;
  return {
    id: rawPage?.id || createId(),
    type: rawPage?.type === 'image' ? 'image' : 'text',
    text: String(rawPage?.text || (hasLegacyTitle ? rawPage.title : '')),
    imagePath: String(rawPage?.imagePath || '')
  };
}

function normalizePages() {
  state.config.content.pages = (state.config.content.pages || []).map(normalizePage);
}

function readPrimitiveInputs() {
  state.config.design.backgroundImage = els.backgroundImage.value.trim();
  state.config.design.displacementMap = els.displacementMap.value.trim();
  state.config.design.pageOffsetX = Number(els.pageOffsetX.value || 0);
  state.config.design.turnAnimationMs = Number(els.turnAnimationMs.value || 700);
  state.config.design.page.background = els.pageBackground.value || '#ffffff';
  state.config.design.page.width = Number(els.pageWidth.value || 900);
  state.config.design.page.height = Number(els.pageHeight.value || 1200);
  state.config.mode.settingsHoldSeconds = Number(els.settingsHoldSeconds.value || 10);

  state.config.autoupdate.policy = els.updatePolicy.value;
  state.config.autoupdate.detectExternalContent = Boolean(els.detectExternalContent.checked);
  state.config.autoupdate.autoCheckOnLaunch = Boolean(els.autoCheckOnLaunch.checked);
}

function writePrimitiveInputs() {
  els.backgroundImage.value = state.config.design.backgroundImage || '';
  els.displacementMap.value = state.config.design.displacementMap || '';
  els.pageOffsetX.value = String(state.config.design.pageOffsetX ?? 0);
  els.turnAnimationMs.value = String(state.config.design.turnAnimationMs ?? 700);
  els.pageBackground.value = state.config.design.page.background || '#ffffff';
  els.pageWidth.value = String(state.config.design.page.width ?? 900);
  els.pageHeight.value = String(state.config.design.page.height ?? 1200);
  els.settingsHoldSeconds.value = String(state.config.mode.settingsHoldSeconds ?? 10);

  els.updatePolicy.value = state.config.autoupdate.policy || 'everything';
  els.detectExternalContent.checked = Boolean(state.config.autoupdate.detectExternalContent);
  els.autoCheckOnLaunch.checked = Boolean(state.config.autoupdate.autoCheckOnLaunch);
}

function createPageCard(page, index) {
  const card = document.createElement('div');
  card.className = 'page-card';

  const typeBadge = document.createElement('strong');
  typeBadge.textContent = page.type === 'image' ? `Image page #${index + 1}` : `Text page #${index + 1}`;

  const body = document.createElement(page.type === 'text' ? 'textarea' : 'input');
  if (page.type === 'text') {
    body.value = page.text || '';
    body.placeholder = 'Page text';
    body.addEventListener('input', () => {
      page.text = body.value;
    });
  } else {
    body.type = 'text';
    body.value = page.imagePath || '';
    body.readOnly = true;
  }

  const actions = document.createElement('div');
  actions.className = 'page-actions';

  const upBtn = document.createElement('button');
  upBtn.textContent = 'Move up';
  upBtn.type = 'button';
  upBtn.disabled = index === 0;
  upBtn.addEventListener('click', () => {
    movePage(index, -1);
  });

  const downBtn = document.createElement('button');
  downBtn.textContent = 'Move down';
  downBtn.type = 'button';
  downBtn.disabled = index === state.config.content.pages.length - 1;
  downBtn.addEventListener('click', () => {
    movePage(index, 1);
  });

  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.type = 'button';
  removeBtn.addEventListener('click', () => {
    state.config.content.pages.splice(index, 1);
    renderPages();
  });

  actions.append(upBtn, downBtn, removeBtn);

  if (page.type === 'image') {
    const replaceBtn = document.createElement('button');
    replaceBtn.textContent = 'Replace image';
    replaceBtn.type = 'button';
    replaceBtn.addEventListener('click', async () => {
      const result = await window.bookApi.pickAsset('image');
      if (!result.canceled) {
        page.imagePath = result.relativePath;
        renderPages();
      }
    });
    actions.append(replaceBtn);
  }

  card.append(typeBadge, body, actions);
  return card;
}

function renderPages() {
  els.pagesList.innerHTML = '';
  state.config.content.pages.forEach((page, index) => {
    els.pagesList.append(createPageCard(page, index));
  });
}

function movePage(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.config.content.pages.length) {
    return;
  }

  const [page] = state.config.content.pages.splice(index, 1);
  state.config.content.pages.splice(target, 0, page);
  renderPages();
}

function appendImagePages(assetPaths) {
  for (const imagePath of assetPaths) {
    state.config.content.pages.push({
      id: createId(),
      type: 'image',
      text: '',
      imagePath
    });
  }

  renderPages();
}

async function filesToImportPayload(files) {
  const payload = [];

  for (const file of Array.from(files || [])) {
    if (!file || (file.type && !file.type.startsWith('image/'))) {
      continue;
    }

    payload.push({
      name: file.name || 'image.png',
      data: await file.arrayBuffer()
    });
  }

  return payload;
}

async function importImagesFromFiles(files) {
  const payload = await filesToImportPayload(files);
  if (payload.length === 0) {
    setStatus('No valid image files were imported.');
    return;
  }

  const imported = await window.bookApi.importAssetsFromFiles(payload);
  if (!imported || imported.length === 0) {
    setStatus('No valid image files were imported.');
    return;
  }

  appendImagePages(imported);
  setStatus(`Added ${imported.length} image page(s). Save to apply.`);
}

async function loadConfig() {
  state.config = clone(await window.bookApi.getConfig());
  normalizePages();
  writePrimitiveInputs();
  renderPages();
}

async function saveConfig() {
  readPrimitiveInputs();
  normalizePages();
  const updated = await window.bookApi.setConfig(state.config);
  state.config = clone(updated);
  normalizePages();
  writePrimitiveInputs();
  renderPages();
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

async function addTextPage() {
  state.config.content.pages.push({
    id: createId(),
    type: 'text',
    text: 'New page text',
    imagePath: ''
  });
  renderPages();
}

async function addImagePage() {
  const result = await window.bookApi.pickAsset('image');
  if (result.canceled) {
    return;
  }

  appendImagePages([result.relativePath]);
}

function bindDropZone() {
  const filePicker = document.createElement('input');
  filePicker.type = 'file';
  filePicker.accept = 'image/*';
  filePicker.multiple = true;
  filePicker.style.display = 'none';
  document.body.append(filePicker);

  filePicker.addEventListener('change', async () => {
    await importImagesFromFiles(filePicker.files || []);

    filePicker.value = '';
  });

  els.dropImagesZone.addEventListener('click', () => {
    filePicker.click();
  });

  els.dropImagesZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    els.dropImagesZone.classList.add('active');
  });

  els.dropImagesZone.addEventListener('dragleave', () => {
    els.dropImagesZone.classList.remove('active');
  });

  els.dropImagesZone.addEventListener('drop', async (event) => {
    event.preventDefault();
    els.dropImagesZone.classList.remove('active');

    await importImagesFromFiles(event.dataTransfer?.files || []);
  });
}

function bindEvents() {
  document.querySelectorAll('[data-pick]').forEach((button) => {
    button.addEventListener('click', async () => {
      await pickAssetAndAssign(button.dataset.pick);
    });
  });

  bindDropZone();

  document.getElementById('addTextPage').addEventListener('click', addTextPage);
  document.getElementById('addImagePage').addEventListener('click', addImagePage);
  document.getElementById('saveAll').addEventListener('click', saveConfig);

  document.getElementById('checkUpdates').addEventListener('click', async () => {
    const result = await window.bookApi.checkForUpdates();
    if (result.available) {
      setStatus(`Update available: ${result.latestVersion}`);
      return;
    }

    setStatus(result.reason || 'No update available.');
  });

  document.getElementById('downloadUpdate').addEventListener('click', async () => {
    const result = await window.bookApi.downloadUpdate();
    setStatus(result.message || 'Download request completed.');
  });

  document.getElementById('installUpdate').addEventListener('click', async () => {
    await window.bookApi.installUpdate();
    setStatus('Installing update...');
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
    setStatus(`Update ${payload.version} downloaded. Click Install update.`);
  });
}

async function bootstrap() {
  bindEvents();
  await loadConfig();
}

bootstrap();
