const FIXED_PAGE_META = [
  { key: 'frontCover', label: 'Front cover' },
  { key: 'innerFront', label: 'Front inner' },
  { key: 'innerBack', label: 'Back inner' },
  { key: 'backCover', label: 'Back cover' }
];

const state = {
  currentUser: null,
  content: null,
  design: null,
  activePane: 'pages',
  selection: { kind: 'fixed', key: 'frontCover' },
  imageUploadMode: 'page',
  quill: null
};

const els = {
  authView: document.getElementById('authView'),
  workspaceView: document.getElementById('workspaceView'),
  bootstrapForm: document.getElementById('bootstrapForm'),
  loginForm: document.getElementById('loginForm'),
  sessionBadge: document.getElementById('sessionBadge'),
  logoutButton: document.getElementById('logoutButton'),
  serverUrl: document.getElementById('serverUrl'),
  itemList: document.getElementById('itemList'),
  pagesTab: document.getElementById('pagesTab'),
  usersTab: document.getElementById('usersTab'),
  pagesPane: document.getElementById('pagesPane'),
  usersPane: document.getElementById('usersPane'),
  usersLockedMessage: document.getElementById('usersLockedMessage'),
  usersAdminContent: document.getElementById('usersAdminContent'),
  itemTitleInput: document.getElementById('itemTitleInput'),
  itemTypeSelect: document.getElementById('itemTypeSelect'),
  moveUpButton: document.getElementById('moveUpButton'),
  moveDownButton: document.getElementById('moveDownButton'),
  removeItemButton: document.getElementById('removeItemButton'),
  documentEditorPanel: document.getElementById('documentEditorPanel'),
  imageEditorPanel: document.getElementById('imageEditorPanel'),
  pageImagePath: document.getElementById('pageImagePath'),
  pageImagePreview: document.getElementById('pageImagePreview'),
  imageInspector: document.getElementById('imageInspector'),
  selectedImageLayout: document.getElementById('selectedImageLayout'),
  selectedImageWidth: document.getElementById('selectedImageWidth'),
  status: document.getElementById('status'),
  usersList: document.getElementById('usersList'),
  assetUploadInput: document.getElementById('assetUploadInput')
};

function setStatus(message) {
  els.status.textContent = message || '';
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function createDocumentPage() {
  return {
    id: crypto.randomUUID(),
    type: 'document',
    title: 'Untitled section',
    html: '<p></p>',
    imagePath: ''
  };
}

function createImagePage() {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    title: 'Image page',
    html: '',
    imagePath: ''
  };
}

function selectionIndex() {
  return state.selection.kind === 'page' ? state.selection.index : -1;
}

function currentItem() {
  if (!state.content) {
    return null;
  }

  if (state.selection.kind === 'fixed') {
    return state.content[state.selection.key];
  }

  return state.content.pages[state.selection.index] || null;
}

function isFixedSelection() {
  return state.selection.kind === 'fixed';
}

function ensureImageSrcForEditor(html = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('figure.rich-image img').forEach((img) => {
    const assetPath = img.getAttribute('data-asset-path');
    if (assetPath) {
      img.setAttribute('src', `/assets/${assetPath.replace(/^assets\//, '')}`);
    }
  });

  return doc.body.firstElementChild?.innerHTML || '<p></p>';
}

function renderChrome() {
  const user = state.currentUser;
  els.sessionBadge.textContent = user ? `${user.displayName} (${user.role})` : '';
  els.serverUrl.textContent = window.location.origin;
  const canManageUsers = user?.role === 'admin';
  els.usersTab.classList.toggle('hidden', !canManageUsers);
  els.usersLockedMessage.classList.toggle('hidden', canManageUsers);
  els.usersAdminContent.classList.toggle('hidden', !canManageUsers);
  if (!canManageUsers && state.activePane === 'users') {
    state.activePane = 'pages';
  }
  renderPaneVisibility();
}

function renderPaneVisibility() {
  const isPages = state.activePane === 'pages';
  els.pagesPane.classList.toggle('hidden', !isPages);
  els.usersPane.classList.toggle('hidden', isPages);
  els.pagesTab.classList.toggle('active', isPages);
  els.usersTab.classList.toggle('active', !isPages);
}

function renderItemList() {
  els.itemList.innerHTML = '';

  for (const meta of FIXED_PAGE_META) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item-button';
    button.classList.toggle(
      'active',
      state.selection.kind === 'fixed' && state.selection.key === meta.key
    );
    button.textContent = meta.label;
    const metaLine = document.createElement('small');
    metaLine.textContent = state.content[meta.key].type;
    button.append(metaLine);
    button.addEventListener('click', () => {
      persistEditorState();
      state.selection = { kind: 'fixed', key: meta.key };
      renderEditor();
      renderItemList();
    });
    els.itemList.append(button);
  }

  state.content.pages.forEach((page, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item-button';
    button.classList.toggle('active', state.selection.kind === 'page' && state.selection.index === index);
    const title = page.title || `Page ${index + 1}`;
    button.textContent = title;
    const metaLine = document.createElement('small');
    metaLine.textContent = `Page ${index + 1} · ${page.type}`;
    button.append(metaLine);
    button.addEventListener('click', () => {
      persistEditorState();
      state.selection = { kind: 'page', index };
      renderEditor();
      renderItemList();
    });
    els.itemList.append(button);
  });
}

function renderPageImagePreview(page) {
  els.pageImagePath.value = page.imagePath || '';
  if (!page.imagePath) {
    els.pageImagePreview.textContent = 'No image selected.';
    return;
  }

  els.pageImagePreview.innerHTML = '';
  const preview = document.createElement('img');
  preview.alt = 'Page preview';
  preview.src = `/assets/${page.imagePath.replace(/^assets\//, '')}`;
  els.pageImagePreview.append(preview);
}

function selectedRichImageFigure() {
  const range = state.quill.getSelection();
  if (!range) {
    return null;
  }

  const [leaf] = state.quill.getLeaf(range.index);
  const node = leaf?.domNode;
  return node?.closest?.('figure.rich-image') || null;
}

function syncImageInspector() {
  const figure = selectedRichImageFigure();
  els.imageInspector.classList.toggle('hidden', !figure);
  if (!figure) {
    return;
  }

  els.selectedImageLayout.value = figure.dataset.layout || 'full';
  els.selectedImageWidth.value = figure.dataset.width || '100';
}

function renderEditor() {
  const page = currentItem();
  if (!page) {
    return;
  }

  els.itemTitleInput.value = page.title || '';
  els.itemTypeSelect.value = page.type;
  els.removeItemButton.disabled = isFixedSelection();
  els.moveUpButton.disabled = isFixedSelection() || selectionIndex() <= 0;
  els.moveDownButton.disabled =
    isFixedSelection() || selectionIndex() >= state.content.pages.length - 1;

  const isDocument = page.type === 'document';
  els.documentEditorPanel.classList.toggle('hidden', !isDocument);
  els.imageEditorPanel.classList.toggle('hidden', isDocument);

  if (isDocument) {
    state.quill.setContents([]);
    state.quill.clipboard.dangerouslyPasteHTML(ensureImageSrcForEditor(page.html || '<p></p>'));
    syncImageInspector();
  } else {
    renderPageImagePreview(page);
  }
}

function persistEditorState() {
  const page = currentItem();
  if (!page) {
    return;
  }

  page.title = els.itemTitleInput.value.trim();
  page.type = els.itemTypeSelect.value;

  if (page.type === 'document') {
    page.html = state.quill.root.innerHTML || '<p></p>';
    page.imagePath = '';
  }
}

function switchItemType(nextType) {
  const page = currentItem();
  if (!page || page.type === nextType) {
    return;
  }

  if (nextType === 'document') {
    page.type = 'document';
    page.html = page.html || '<p></p>';
    page.imagePath = '';
  } else {
    page.type = 'image';
    page.html = '';
  }

  renderEditor();
  renderItemList();
}

async function loadContent() {
  const payload = await request('/api/content');
  state.content = payload.content;
  state.design = payload.design;
  renderItemList();
  renderEditor();
}

async function saveContent() {
  persistEditorState();
  const payload = await request('/api/content', {
    method: 'PUT',
    body: JSON.stringify({ content: state.content })
  });
  state.content = payload.content;
  renderItemList();
  renderEditor();
  setStatus('Content saved.');
}

async function uploadFiles(files) {
  const prepared = await Promise.all(
    Array.from(files || []).map(async (file) => ({
      name: file.name,
      dataBase64: await fileToBase64(file)
    }))
  );

  return request('/api/assets/import', {
    method: 'POST',
    body: JSON.stringify({ files: prepared })
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.split(',')[1] || '');
    };
    reader.readAsDataURL(file);
  });
}

function chooseAsset(mode) {
  state.imageUploadMode = mode;
  els.assetUploadInput.click();
}

async function insertRichImage(file) {
  const result = await uploadFiles([file]);
  const uploaded = result.urls?.[0];
  if (!uploaded) {
    return;
  }

  const range = state.quill.getSelection(true) || { index: state.quill.getLength(), length: 0 };
  state.quill.insertEmbed(range.index, 'richImage', {
    assetPath: uploaded.assetPath,
    url: uploaded.url,
    layout: 'full',
    width: 100
  }, 'user');
  state.quill.setSelection(range.index + 1, 0, 'silent');
  syncImageInspector();
}

async function assignPageImage(file) {
  const result = await uploadFiles([file]);
  const uploaded = result.urls?.[0];
  if (!uploaded) {
    return;
  }

  const page = currentItem();
  if (!page) {
    return;
  }

  page.imagePath = uploaded.assetPath;
  renderPageImagePreview(page);
  renderItemList();
}

async function loadUsers() {
  if (state.currentUser?.role !== 'admin') {
    return;
  }

  const payload = await request('/api/users');
  els.usersList.innerHTML = '';

  payload.users.forEach((user) => {
    const card = document.createElement('form');
    card.className = 'user-card';
    const title = document.createElement('strong');
    title.textContent = user.displayName;

    const usernameLabel = document.createElement('label');
    usernameLabel.textContent = 'Username';
    const usernameInput = document.createElement('input');
    usernameInput.name = 'username';
    usernameInput.value = user.username;
    usernameLabel.append(usernameInput);

    const displayNameLabel = document.createElement('label');
    displayNameLabel.textContent = 'Display name';
    const displayNameInput = document.createElement('input');
    displayNameInput.name = 'displayName';
    displayNameInput.value = user.displayName;
    displayNameLabel.append(displayNameInput);

    const roleLabel = document.createElement('label');
    roleLabel.textContent = 'Role';
    const roleSelect = document.createElement('select');
    roleSelect.name = 'role';
    ['editor', 'admin'].forEach((role) => {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role[0].toUpperCase() + role.slice(1);
      option.selected = user.role === role;
      roleSelect.append(option);
    });
    roleLabel.append(roleSelect);

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = 'New password';
    const passwordInput = document.createElement('input');
    passwordInput.name = 'password';
    passwordInput.type = 'password';
    passwordInput.minLength = 8;
    passwordLabel.append(passwordInput);

    const activeLabel = document.createElement('label');
    activeLabel.textContent = 'Active';
    const activeSelect = document.createElement('select');
    activeSelect.name = 'isActive';
    [
      { value: 'true', label: 'Active', selected: user.isActive },
      { value: 'false', label: 'Disabled', selected: !user.isActive }
    ].forEach((meta) => {
      const option = document.createElement('option');
      option.value = meta.value;
      option.textContent = meta.label;
      option.selected = meta.selected;
      activeSelect.append(option);
    });
    activeLabel.append(activeSelect);

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.textContent = 'Save user';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'secondary';
    deleteButton.textContent = 'Delete';
    deleteButton.dataset.delete = 'true';
    actions.append(saveButton, deleteButton);

    card.append(
      title,
      usernameLabel,
      displayNameLabel,
      roleLabel,
      passwordLabel,
      activeLabel,
      actions
    );

    card.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(card);
      await request(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          username: formData.get('username'),
          displayName: formData.get('displayName'),
          role: formData.get('role'),
          password: formData.get('password'),
          isActive: formData.get('isActive') === 'true'
        })
      });
      setStatus(`Updated ${user.username}.`);
      await loadUsers();
    });

    deleteButton.addEventListener('click', async () => {
      await request(`/api/users/${user.id}`, { method: 'DELETE' });
      setStatus(`Deleted ${user.username}.`);
      await loadUsers();
    });

    els.usersList.append(card);
  });
}

function bindQuill() {
  const BlockEmbed = Quill.import('blots/block/embed');

  class RichImageBlot extends BlockEmbed {
    static blotName = 'richImage';
    static tagName = 'figure';
    static className = 'rich-image';

    static create(value) {
      const node = super.create();
      this.apply(node, value);
      return node;
    }

    static value(node) {
      const image = node.querySelector('img');
      return {
        assetPath: image?.getAttribute('data-asset-path') || '',
        url: image?.getAttribute('src') || '',
        layout: node.dataset.layout || 'full',
        width: Number(node.dataset.width || 100)
      };
    }

    static apply(node, value = {}) {
      node.setAttribute('contenteditable', 'false');
      node.dataset.layout = value.layout || 'full';
      node.dataset.width = String(value.width || 100);
      node.style.width = `${value.width || 100}%`;

      node.innerHTML = '';
      const image = document.createElement('img');
      image.alt = 'Inserted';
      image.src = value.url || '';
      if (value.assetPath) {
        image.setAttribute('data-asset-path', value.assetPath);
      }

      node.append(image);
    }

    formats() {
      return {
        layout: this.domNode.dataset.layout || 'full',
        width: this.domNode.dataset.width || '100'
      };
    }

    format(name, value) {
      if (name === 'layout') {
        this.domNode.dataset.layout = value || 'full';
        return;
      }

      if (name === 'width') {
        const nextValue = Number(value || 100);
        this.domNode.dataset.width = String(nextValue);
        this.domNode.style.width = `${nextValue}%`;
        return;
      }

      super.format(name, value);
    }
  }

  class PageBreakBlot extends BlockEmbed {
    static blotName = 'pageBreak';
    static tagName = 'hr';
    static className = 'rich-page-break';

    static create() {
      const node = super.create();
      node.setAttribute('data-page-break', 'true');
      node.setAttribute('contenteditable', 'false');
      return node;
    }
  }

  Quill.register(RichImageBlot);
  Quill.register(PageBreakBlot);

  state.quill = new Quill('#richEditor', {
    theme: 'snow',
    modules: {
      toolbar: '#editorToolbar'
    }
  });

  state.quill.root.classList.add('rich-content-root');
  state.quill.on('selection-change', syncImageInspector);
  state.quill.root.addEventListener('click', (event) => {
    const figure = event.target.closest('figure.rich-image');
    if (!figure) {
      syncImageInspector();
      return;
    }

    const blot = Quill.find(figure);
    const index = state.quill.getIndex(blot);
    state.quill.setSelection(index, 1, 'user');
    syncImageInspector();
  });
}

async function authenticate() {
  const bootstrapStatus = await request('/api/bootstrap-status');
  els.bootstrapForm.classList.toggle('hidden', !bootstrapStatus.bootstrapRequired);
  els.loginForm.classList.toggle('hidden', bootstrapStatus.bootstrapRequired);

  if (!bootstrapStatus.bootstrapRequired) {
    try {
      const session = await request('/api/session');
      state.currentUser = session.user;
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

async function showWorkspace() {
  els.authView.classList.add('hidden');
  els.workspaceView.classList.remove('hidden');
  renderChrome();
  await loadContent();
  await loadUsers();
}

function bindEvents() {
  els.pagesTab.addEventListener('click', () => {
    persistEditorState();
    state.activePane = 'pages';
    renderPaneVisibility();
  });

  els.usersTab.addEventListener('click', async () => {
    persistEditorState();
    state.activePane = 'users';
    renderPaneVisibility();
    await loadUsers();
  });

  els.logoutButton.addEventListener('click', async () => {
    await request('/api/logout', { method: 'POST' });
    window.location.reload();
  });

  els.itemTitleInput.addEventListener('input', () => {
    const page = currentItem();
    if (!page) {
      return;
    }

    page.title = els.itemTitleInput.value.trim();
    renderItemList();
  });

  els.itemTypeSelect.addEventListener('change', () => {
    switchItemType(els.itemTypeSelect.value);
  });

  document.getElementById('addDocumentButton').addEventListener('click', () => {
    persistEditorState();
    state.content.pages.push(createDocumentPage());
    state.selection = { kind: 'page', index: state.content.pages.length - 1 };
    renderItemList();
    renderEditor();
  });

  document.getElementById('addImagePageButton').addEventListener('click', () => {
    persistEditorState();
    state.content.pages.push(createImagePage());
    state.selection = { kind: 'page', index: state.content.pages.length - 1 };
    renderItemList();
    renderEditor();
  });

  document.getElementById('saveContentButton').addEventListener('click', saveContent);

  document.getElementById('moveUpButton').addEventListener('click', () => {
    const index = selectionIndex();
    if (index <= 0) {
      return;
    }

    persistEditorState();
    const [page] = state.content.pages.splice(index, 1);
    state.content.pages.splice(index - 1, 0, page);
    state.selection.index = index - 1;
    renderItemList();
    renderEditor();
  });

  document.getElementById('moveDownButton').addEventListener('click', () => {
    const index = selectionIndex();
    if (index < 0 || index >= state.content.pages.length - 1) {
      return;
    }

    persistEditorState();
    const [page] = state.content.pages.splice(index, 1);
    state.content.pages.splice(index + 1, 0, page);
    state.selection.index = index + 1;
    renderItemList();
    renderEditor();
  });

  document.getElementById('removeItemButton').addEventListener('click', () => {
    const index = selectionIndex();
    if (index < 0) {
      return;
    }

    state.content.pages.splice(index, 1);
    state.selection = state.content.pages.length
      ? { kind: 'page', index: Math.max(0, index - 1) }
      : { kind: 'fixed', key: 'frontCover' };
    renderItemList();
    renderEditor();
  });

  document.getElementById('choosePageImageButton').addEventListener('click', () => {
    chooseAsset('page');
  });

  document.getElementById('insertInlineImageButton').addEventListener('click', () => {
    chooseAsset('editor');
  });

  document.getElementById('insertPageBreakButton').addEventListener('click', () => {
    const range = state.quill.getSelection(true) || { index: state.quill.getLength(), length: 0 };
    state.quill.insertEmbed(range.index, 'pageBreak', true, 'user');
    state.quill.insertText(range.index + 1, '\n', 'user');
    state.quill.setSelection(range.index + 2, 0, 'silent');
  });

  els.selectedImageLayout.addEventListener('change', () => {
    const figure = selectedRichImageFigure();
    if (!figure) {
      return;
    }

    const blot = Quill.find(figure);
    blot.format('layout', els.selectedImageLayout.value);
  });

  els.selectedImageWidth.addEventListener('input', () => {
    const figure = selectedRichImageFigure();
    if (!figure) {
      return;
    }

    const blot = Quill.find(figure);
    blot.format('width', Number(els.selectedImageWidth.value));
  });

  document.getElementById('removeSelectedImageButton').addEventListener('click', () => {
    const range = state.quill.getSelection();
    if (!range) {
      return;
    }

    state.quill.deleteText(range.index, Math.max(1, range.length || 1), 'user');
    syncImageInspector();
  });

  els.assetUploadInput.addEventListener('change', async () => {
    const [file] = els.assetUploadInput.files || [];
    els.assetUploadInput.value = '';
    if (!file) {
      return;
    }

    if (state.imageUploadMode === 'editor') {
      await insertRichImage(file);
      return;
    }

    await assignPageImage(file);
  });

  els.bootstrapForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = await request('/api/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('bootstrapUsername').value,
        displayName: document.getElementById('bootstrapDisplayName').value,
        password: document.getElementById('bootstrapPassword').value
      })
    });
    state.currentUser = payload.user;
    await showWorkspace();
    setStatus('First admin created.');
  });

  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = await request('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('loginUsername').value,
        password: document.getElementById('loginPassword').value
      })
    });
    state.currentUser = payload.user;
    await showWorkspace();
    setStatus('Signed in.');
  });

  document.getElementById('createUserForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await request('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('newUsername').value,
        displayName: document.getElementById('newDisplayName').value,
        role: document.getElementById('newRole').value,
        password: document.getElementById('newPassword').value
      })
    });
    event.target.reset();
    await loadUsers();
    setStatus('User created.');
  });
}

async function bootstrap() {
  bindQuill();
  bindEvents();

  const authenticated = await authenticate();
  if (authenticated) {
    await showWorkspace();
    return;
  }

  els.authView.classList.remove('hidden');
  els.workspaceView.classList.add('hidden');
  document.getElementById('logoutButton').classList.add('hidden');
}

bootstrap().catch((error) => {
  setStatus(error.message);
});
