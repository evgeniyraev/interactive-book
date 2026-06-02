const FIXED_PAGE_META = [
  { key: 'frontCover', label: 'Front cover' },
  { key: 'innerFront', label: 'Front inner' },
  { key: 'innerBack', label: 'Back inner' },
  { key: 'backCover', label: 'Back cover' }
];

const CONTENT_PADDING = '2.2rem';

const state = {
  currentUser: null,
  books: [],
  activeBookId: '',
  content: null,
  design: null,
  activePane: 'pages',
  selection: { kind: 'fixed', key: 'frontCover' },
  imageUploadMode: 'page',
  quill: null,
  draggedBookIndex: null,
  draggedPageIndex: null,
  resizeSession: null,
  overflowCheckTimer: null,
  overflowFragments: null
};

const els = {
  authView: document.getElementById('authView'),
  workspaceView: document.getElementById('workspaceView'),
  bootstrapForm: document.getElementById('bootstrapForm'),
  loginForm: document.getElementById('loginForm'),
  sessionBadge: document.getElementById('sessionBadge'),
  logoutButton: document.getElementById('logoutButton'),
  serverUrl: document.getElementById('serverUrl'),
  bookList: document.getElementById('bookList'),
  bookTitleInput: document.getElementById('bookTitleInput'),
  bookDescriptionInput: document.getElementById('bookDescriptionInput'),
  bookSideViewColorInput: document.getElementById('bookSideViewColorInput'),
  bookSideViewColorCodeInput: document.getElementById('bookSideViewColorCodeInput'),
  bookSideViewColorSwatch: document.getElementById('bookSideViewColorSwatch'),
  bookSideViewColorValue: document.getElementById('bookSideViewColorValue'),
  bookSideViewOpacityInput: document.getElementById('bookSideViewOpacityInput'),
  clearBookSideViewTintButton: document.getElementById('clearBookSideViewTintButton'),
  addBookButton: document.getElementById('addBookButton'),
  moveBookUpButton: document.getElementById('moveBookUpButton'),
  moveBookDownButton: document.getElementById('moveBookDownButton'),
  removeBookButton: document.getElementById('removeBookButton'),
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
  editorShell: document.getElementById('editorShell'),
  pageImagePath: document.getElementById('pageImagePath'),
  pageImagePreview: document.getElementById('pageImagePreview'),
  selectedImageToolbar: document.getElementById('selectedImageToolbar'),
  selectedImageResizeHandle: document.getElementById('selectedImageResizeHandle'),
  overflowNotice: document.getElementById('overflowNotice'),
  overflowMessage: document.getElementById('overflowMessage'),
  splitOverflowButton: document.getElementById('splitOverflowButton'),
  status: document.getElementById('status'),
  usersList: document.getElementById('usersList'),
  assetUploadInput: document.getElementById('assetUploadInput'),
  pdfUploadInput: document.getElementById('pdfUploadInput'),
  pdfDropZone: document.getElementById('pdfDropZone'),
  pdfFileName: document.getElementById('pdfFileName'),
  pdfImportedAt: document.getElementById('pdfImportedAt'),
  removePdfButton: document.getElementById('removePdfButton'),
  paginationLab: document.getElementById('paginationLab'),
  alignImageLeftButton: document.getElementById('alignImageLeftButton'),
  alignImageCenterButton: document.getElementById('alignImageCenterButton'),
  alignImageRightButton: document.getElementById('alignImageRightButton'),
  newRole: document.getElementById('newRole'),
  createUserButton: document.getElementById('createUserButton')
};

function setStatus(message) {
  els.status.textContent = message || '';
}

function cssLengthToPx(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.endsWith('rem')) {
    return Number.parseFloat(trimmed) * Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
  }

  if (trimmed.endsWith('px')) {
    return Number.parseFloat(trimmed);
  }

  return Number.parseFloat(trimmed) || 0;
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

function createDocumentPage(options = {}) {
  return {
    id: crypto.randomUUID(),
    type: 'document',
    title: String(options.title || 'Untitled section'),
    html: String(options.html || '<p></p>'),
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createPdfSource(options = {}) {
  return {
    assetPath: String(options.assetPath || ''),
    fileName: String(options.fileName || ''),
    importedAt: String(options.importedAt || ''),
    pageCount: Number(options.pageCount || 0)
  };
}

function createDefaultContent(title = 'Untitled book') {
  return {
    frontCover: createDocumentPage({
      title: 'Front cover',
      html: `<h1>${escapeHtml(title)}</h1>`
    }),
    innerFront: createDocumentPage({ title: 'Front inner', html: '<p></p>' }),
    innerBack: createDocumentPage({ title: 'Back inner', html: '<p></p>' }),
    backCover: createDocumentPage({ title: 'Back cover', html: '<p></p>' }),
    pages: [createDocumentPage({ title: 'Page 1' })],
    pdfSource: createPdfSource()
  };
}

function createBook(options = {}) {
  const title = String(options.title || 'Untitled book');
  return {
    id: crypto.randomUUID(),
    title,
    description: String(options.description || ''),
    sideViewColor: String(options.sideViewColor || '#c8b79b'),
    sideViewOpacity: String(options.sideViewOpacity ?? '1'),
    content: options.content || createDefaultContent(title)
  };
}

function activeBookIndex() {
  return state.books.findIndex((book) => book.id === state.activeBookId);
}

function currentBook() {
  const index = activeBookIndex();
  return index >= 0 ? state.books[index] : null;
}

function syncActiveContentFromBook() {
  state.content = currentBook()?.content || null;
}

function persistBookMetaState() {
  const book = currentBook();
  if (!book) {
    return;
  }

  book.title = els.bookTitleInput.value;
  book.description = els.bookDescriptionInput.value;
}

function normalizeColorCode(value) {
  const input = String(value || '').trim();
  const prefixed = input.startsWith('#') ? input : `#${input}`;
  const match = prefixed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return '';
  }

  const hex = match[1].toLowerCase();
  if (hex.length === 3) {
    return `#${hex.split('').map((part) => part + part).join('')}`;
  }

  return `#${hex}`;
}

function normalizeHexColor(value, fallback = '#c8b79b') {
  return normalizeColorCode(value) || fallback;
}

function normalizedOpacity(value, fallback = '1') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return String(Math.min(1, Math.max(0, numeric)));
}

function updateBookTintSummary(book = currentBook()) {
  const color = normalizeHexColor(book?.sideViewColor, '#c8b79b');
  const hasCustomColor = Boolean(book?.sideViewColor);
  const opacity = normalizedOpacity(book?.sideViewOpacity, '1');
  const hasCustomOpacity = Boolean(book?.sideViewOpacity);

  els.bookSideViewColorSwatch.style.background = color;
  els.bookSideViewColorSwatch.style.opacity = opacity;
  els.bookSideViewColorValue.textContent = hasCustomColor || hasCustomOpacity
    ? `${hasCustomColor ? color : 'Default color'} · ${Math.round(Number(opacity) * 100)}%`
    : 'Default';
}

function persistBookTintState() {
  const book = currentBook();
  if (!book) {
    return;
  }

  const color = normalizeColorCode(els.bookSideViewColorCodeInput.value || els.bookSideViewColorInput.value);
  if (!color) {
    els.bookSideViewColorCodeInput.setCustomValidity('Use a hex color like #c8b79b.');
    return;
  }

  els.bookSideViewColorCodeInput.setCustomValidity('');
  book.sideViewColor = color;
  book.sideViewOpacity = normalizedOpacity(els.bookSideViewOpacityInput.value, '1');
  els.bookSideViewColorInput.value = color;
  els.bookSideViewColorCodeInput.value = color;
  updateBookTintSummary(book);
}

function clearBookTintState() {
  const book = currentBook();
  if (!book) {
    return;
  }

  book.sideViewColor = '';
  book.sideViewOpacity = '';
  renderBookDetails();
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

function normalizeLayout(layout) {
  if (layout === 'left' || layout === 'right') {
    return layout;
  }

  return 'center';
}

function canManageUsersInUi() {
  return state.currentUser?.role === 'admin' || state.currentUser?.role === 'superadmin';
}

function canCreateAdminsInUi() {
  return state.currentUser?.role === 'superadmin';
}

function roleLabel(role) {
  if (role === 'superadmin') {
    return 'Superadmin';
  }

  if (role === 'admin') {
    return 'Admin';
  }

  return 'Writer';
}

function canManageTargetInUi(user) {
  if (!canManageUsersInUi() || !user || user.isBuiltin) {
    return false;
  }

  if (state.currentUser.role === 'superadmin') {
    return user.role === 'admin' || user.role === 'editor';
  }

  return user.role === 'editor';
}

function currentPdfSource() {
  return state.content?.pdfSource || null;
}

function formatImportedAt(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderPdfPanel() {
  const source = currentPdfSource();
  const hasPdf = Boolean(source?.assetPath);

  els.pdfFileName.textContent = hasPdf ? source.fileName || source.assetPath : 'No PDF uploaded';
  els.pdfImportedAt.textContent = hasPdf
    ? `Uploaded ${formatImportedAt(source.importedAt) || 'recently'}. Upload another PDF to replace it.`
    : 'The viewer will keep showing the legacy rich-content book until a PDF is uploaded.';
  els.removePdfButton.disabled = !hasPdf;
}

function ensureImageSrcForEditor(html = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('figure.rich-image').forEach((figure) => {
    const layout = normalizeLayout(figure.getAttribute('data-layout') || figure.dataset.layout);
    figure.setAttribute('data-layout', layout);
    figure.dataset.layout = layout;
  });
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
  els.sessionBadge.textContent = user ? `${user.displayName} (${roleLabel(user.role)})` : '';
  els.serverUrl.textContent = window.location.origin;
  const canManage = canManageUsersInUi();
  els.usersTab.classList.toggle('hidden', !canManage);
  els.usersLockedMessage.classList.toggle('hidden', canManage);
  els.usersAdminContent.classList.toggle('hidden', !canManage);
  if (!canManage && state.activePane === 'users') {
    state.activePane = 'pages';
  }
  renderUserRoleOptions();
  renderPaneVisibility();
}

function renderUserRoleOptions() {
  els.newRole.innerHTML = '';

  const writerOption = document.createElement('option');
  writerOption.value = 'editor';
  writerOption.textContent = 'Writer';
  els.newRole.append(writerOption);

  if (canCreateAdminsInUi()) {
    const adminOption = document.createElement('option');
    adminOption.value = 'admin';
    adminOption.textContent = 'Admin';
    els.newRole.append(adminOption);
  }

  els.createUserButton.textContent = canCreateAdminsInUi() ? 'Create user' : 'Create writer';
}

function renderPaneVisibility() {
  const isPages = state.activePane === 'pages';
  els.pagesPane.classList.toggle('hidden', !isPages);
  els.usersPane.classList.toggle('hidden', isPages);
  els.pagesTab.classList.toggle('active', isPages);
  els.usersTab.classList.toggle('active', !isPages);
}

function createListButton(label, metaText, className = 'item-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  const metaLine = document.createElement('small');
  metaLine.textContent = metaText;
  button.append(metaLine);
  return button;
}

function pageCountLabel(content) {
  const pageCount = Array.isArray(content?.pages) ? content.pages.length : 0;
  return pageCount === 1 ? '1 page' : `${pageCount} pages`;
}

function renderBookDetails() {
  const book = currentBook();
  const index = activeBookIndex();

  els.bookTitleInput.value = book?.title || '';
  els.bookDescriptionInput.value = book?.description || '';
  const sideViewColor = normalizeHexColor(book?.sideViewColor, '#c8b79b');
  els.bookSideViewColorInput.value = sideViewColor;
  els.bookSideViewColorCodeInput.value = sideViewColor;
  els.bookSideViewColorCodeInput.setCustomValidity('');
  els.bookSideViewOpacityInput.value = normalizedOpacity(book?.sideViewOpacity, '1');
  updateBookTintSummary(book);
  els.moveBookUpButton.disabled = index <= 0;
  els.moveBookDownButton.disabled = index < 0 || index >= state.books.length - 1;
  els.removeBookButton.disabled = state.books.length <= 1 || index < 0;
}

function clearBookDropTargets() {
  els.bookList.querySelectorAll('.drop-target').forEach((node) => node.classList.remove('drop-target'));
}

function selectBook(bookId) {
  if (bookId === state.activeBookId) {
    return;
  }

  persistEditorState();
  persistBookMetaState();
  state.activeBookId = bookId;
  syncActiveContentFromBook();
  state.selection = { kind: 'fixed', key: 'frontCover' };
  renderBookList();
  renderPdfPanel();
  renderItemList();
  renderEditor();
}

function moveBook(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return;
  }

  if (fromIndex >= state.books.length || toIndex >= state.books.length) {
    return;
  }

  persistEditorState();
  persistBookMetaState();
  const previousActiveBookId = state.activeBookId;
  const [book] = state.books.splice(fromIndex, 1);
  state.books.splice(toIndex, 0, book);
  state.activeBookId = previousActiveBookId;
  syncActiveContentFromBook();
  renderBookList();
  renderPdfPanel();
  renderItemList();
  renderEditor();
}

function renderBookList(options = {}) {
  els.bookList.innerHTML = '';

  state.books.forEach((book, index) => {
    const source = book.content?.pdfSource?.assetPath ? 'PDF' : 'Rich content';
    const button = createListButton(
      book.title || `Book ${index + 1}`,
      `${source} · ${pageCountLabel(book.content)}`,
      'book-button'
    );
    button.classList.toggle('active', book.id === state.activeBookId);
    button.draggable = true;
    button.dataset.bookId = book.id;
    button.dataset.bookIndex = String(index);

    button.addEventListener('click', () => {
      selectBook(book.id);
    });

    button.addEventListener('dragstart', () => {
      state.draggedBookIndex = index;
      button.classList.add('dragging');
    });

    button.addEventListener('dragend', () => {
      state.draggedBookIndex = null;
      clearBookDropTargets();
      button.classList.remove('dragging');
    });

    button.addEventListener('dragover', (event) => {
      if (state.draggedBookIndex == null) {
        return;
      }

      event.preventDefault();
      clearBookDropTargets();
      button.classList.add('drop-target');
    });

    button.addEventListener('dragleave', () => {
      button.classList.remove('drop-target');
    });

    button.addEventListener('drop', (event) => {
      event.preventDefault();
      const fromIndex = state.draggedBookIndex;
      state.draggedBookIndex = null;
      clearBookDropTargets();
      button.classList.remove('drop-target');
      if (fromIndex == null) {
        return;
      }

      moveBook(fromIndex, index);
    });

    els.bookList.append(button);
  });

  if (options.updateDetails !== false) {
    renderBookDetails();
  }
}

function movePage(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return;
  }

  if (fromIndex >= state.content.pages.length || toIndex >= state.content.pages.length) {
    return;
  }

  persistEditorState();
  const [page] = state.content.pages.splice(fromIndex, 1);
  state.content.pages.splice(toIndex, 0, page);

  if (state.selection.kind === 'page') {
    if (state.selection.index === fromIndex) {
      state.selection.index = toIndex;
    } else if (fromIndex < state.selection.index && toIndex >= state.selection.index) {
      state.selection.index -= 1;
    } else if (fromIndex > state.selection.index && toIndex <= state.selection.index) {
      state.selection.index += 1;
    }
  }

  renderItemList();
  renderEditor();
}

function clearDropTargets() {
  els.itemList.querySelectorAll('.drop-target').forEach((node) => node.classList.remove('drop-target'));
}

function renderItemList() {
  els.itemList.innerHTML = '';
  if (!state.content) {
    return;
  }

  for (const meta of FIXED_PAGE_META) {
    const button = createListButton(meta.label, state.content[meta.key].type);
    button.classList.toggle(
      'active',
      state.selection.kind === 'fixed' && state.selection.key === meta.key
    );
    button.addEventListener('click', () => {
      persistEditorState();
      state.selection = { kind: 'fixed', key: meta.key };
      renderEditor();
      renderItemList();
    });
    els.itemList.append(button);
  }

  state.content.pages.forEach((page, index) => {
    const title = page.title || `Page ${index + 1}`;
    const button = createListButton(title, `Page ${index + 1} · ${page.type}`);
    button.classList.toggle('active', state.selection.kind === 'page' && state.selection.index === index);
    button.draggable = true;
    button.dataset.pageIndex = String(index);

    button.addEventListener('click', () => {
      persistEditorState();
      state.selection = { kind: 'page', index };
      renderEditor();
      renderItemList();
    });

    button.addEventListener('dragstart', () => {
      state.draggedPageIndex = index;
      button.classList.add('dragging');
    });

    button.addEventListener('dragend', () => {
      state.draggedPageIndex = null;
      clearDropTargets();
      button.classList.remove('dragging');
    });

    button.addEventListener('dragover', (event) => {
      if (state.draggedPageIndex == null) {
        return;
      }

      event.preventDefault();
      clearDropTargets();
      button.classList.add('drop-target');
    });

    button.addEventListener('dragleave', () => {
      button.classList.remove('drop-target');
    });

    button.addEventListener('drop', (event) => {
      event.preventDefault();
      const fromIndex = state.draggedPageIndex;
      state.draggedPageIndex = null;
      clearDropTargets();
      button.classList.remove('drop-target');
      if (fromIndex == null) {
        return;
      }

      movePage(fromIndex, index);
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

function getPageDimensions() {
  return {
    width: Number(state.design?.page?.width) || 900,
    height: Number(state.design?.page?.height) || 1200
  };
}

function updateEditorPageMetrics() {
  const { width, height } = getPageDimensions();
  const maxWidth = Math.max(320, els.documentEditorPanel.clientWidth - 40);
  const maxHeight = Math.max(420, window.innerHeight - 280);
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);

  document.documentElement.style.setProperty('--editor-page-width', `${width}px`);
  document.documentElement.style.setProperty('--editor-page-height', `${height}px`);
  document.documentElement.style.setProperty('--editor-page-scale', String(scale));
  document.documentElement.style.setProperty('--editor-content-padding', CONTENT_PADDING);
}

function selectedRichImageFigure() {
  const range = state.quill?.getSelection();
  if (!range) {
    return null;
  }

  const [leaf] = state.quill.getLeaf(range.index);
  const node = leaf?.domNode;
  return node?.closest?.('figure.rich-image') || null;
}

function hideSelectedImageControls() {
  els.selectedImageToolbar.classList.add('hidden');
  els.selectedImageResizeHandle.classList.add('hidden');
  [els.alignImageLeftButton, els.alignImageCenterButton, els.alignImageRightButton].forEach((button) => {
    button.classList.remove('active');
  });
}

function positionSelectedImageControls() {
  if (!state.quill || currentItem()?.type !== 'document') {
    hideSelectedImageControls();
    return;
  }

  const figure = selectedRichImageFigure();
  if (!figure) {
    hideSelectedImageControls();
    return;
  }

  const shellRect = els.editorShell.getBoundingClientRect();
  const figureRect = figure.getBoundingClientRect();
  els.selectedImageToolbar.classList.remove('hidden');
  els.selectedImageResizeHandle.classList.remove('hidden');
  const toolbarRect = els.selectedImageToolbar.getBoundingClientRect();
  const toolbarTop = Math.max(8, figureRect.top - shellRect.top - toolbarRect.height - 10);
  const toolbarLeft = Math.min(
    Math.max(8, figureRect.left - shellRect.left),
    Math.max(8, shellRect.width - toolbarRect.width - 8)
  );

  els.selectedImageToolbar.style.top = `${toolbarTop}px`;
  els.selectedImageToolbar.style.left = `${toolbarLeft}px`;

  els.selectedImageResizeHandle.style.top = `${figureRect.bottom - shellRect.top - 9}px`;
  els.selectedImageResizeHandle.style.left = `${figureRect.right - shellRect.left - 9}px`;

  const layout = normalizeLayout(figure.dataset.layout);
  els.alignImageLeftButton.classList.toggle('active', layout === 'left');
  els.alignImageCenterButton.classList.toggle('active', layout === 'center');
  els.alignImageRightButton.classList.toggle('active', layout === 'right');
}

function schedulePositionSelectedImageControls() {
  requestAnimationFrame(() => {
    positionSelectedImageControls();
  });
}

function renderOverflowState() {
  const fragments = state.overflowFragments || [];
  const page = currentItem();
  const overflowCount = Math.max(0, fragments.length - 1);
  const showOverflow = page?.type === 'document' && overflowCount > 0;

  els.overflowNotice.classList.toggle('hidden', !showOverflow);
  if (!showOverflow) {
    return;
  }

  els.overflowMessage.textContent =
    overflowCount === 1
      ? 'This page contains more text than one app page can display. Create a continuation page for the extra content.'
      : `This page needs ${overflowCount} more pages in the app. Create continuation pages to keep the layout intentional.`;
  els.splitOverflowButton.disabled = isFixedSelection();
}

function scheduleOverflowCheck() {
  clearTimeout(state.overflowCheckTimer);
  state.overflowCheckTimer = setTimeout(() => {
    if (!state.quill || currentItem()?.type !== 'document') {
      state.overflowFragments = null;
      renderOverflowState();
      return;
    }

    state.overflowFragments = window.richContentRuntime.paginatePreparedHtml(
      state.quill.root.innerHTML || '<p></p>',
      els.paginationLab
    );
    renderOverflowState();
  }, 60);
}

function renderEditor() {
  const page = currentItem();
  if (!page) {
    return;
  }

  updateEditorPageMetrics();
  els.itemTitleInput.value = page.title || '';
  els.itemTypeSelect.value = page.type;
  els.removeItemButton.disabled = isFixedSelection();
  els.moveUpButton.disabled = isFixedSelection() || selectionIndex() <= 0;
  els.moveDownButton.disabled = isFixedSelection() || selectionIndex() >= state.content.pages.length - 1;

  const isDocument = page.type === 'document';
  els.documentEditorPanel.classList.toggle('hidden', !isDocument);
  els.imageEditorPanel.classList.toggle('hidden', isDocument);

  if (isDocument) {
    state.quill.setContents([]);
    state.quill.clipboard.dangerouslyPasteHTML(ensureImageSrcForEditor(page.html || '<p></p>'));
    scheduleOverflowCheck();
    schedulePositionSelectedImageControls();
  } else {
    state.overflowFragments = null;
    renderOverflowState();
    hideSelectedImageControls();
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

function applyLibraryPayload(payload) {
  state.books = Array.isArray(payload.books) && payload.books.length > 0
    ? payload.books
    : [createBook({ title: 'Book 1', content: payload.content })];
  state.activeBookId = state.books.some((book) => book.id === payload.activeBookId)
    ? payload.activeBookId
    : state.books[0]?.id || '';
  state.design = payload.design;
  syncActiveContentFromBook();
}

async function loadContent() {
  const payload = await request('/api/content');
  applyLibraryPayload(payload);
  renderPdfPanel();
  renderBookList();
  renderItemList();
  renderEditor();
}

async function saveContent() {
  persistEditorState();
  persistBookMetaState();
  const payload = await request('/api/content', {
    method: 'PUT',
    body: JSON.stringify({
      books: state.books,
      activeBookId: state.activeBookId
    })
  });
  applyLibraryPayload(payload);
  renderPdfPanel();
  renderBookList();
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

function isPdfFile(file) {
  return Boolean(file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')));
}

async function importPdfFile(file) {
  if (!isPdfFile(file)) {
    setStatus('Upload a PDF file.');
    return;
  }

  setStatus(`Uploading ${file.name}...`);
  persistEditorState();
  persistBookMetaState();
  const payload = await request('/api/content/pdf', {
    method: 'POST',
    body: JSON.stringify({
      bookId: state.activeBookId,
      file: {
        name: file.name,
        dataBase64: await fileToBase64(file)
      }
    })
  });

  applyLibraryPayload(payload);
  renderPdfPanel();
  renderBookList();
  renderItemList();
  renderEditor();
  setStatus(`${file.name} is now the active book PDF.`);
}

async function clearPdfSource() {
  persistEditorState();
  persistBookMetaState();
  const payload = await request(`/api/content/pdf?bookId=${encodeURIComponent(state.activeBookId)}`, {
    method: 'DELETE'
  });

  applyLibraryPayload(payload);
  renderPdfPanel();
  renderBookList();
  renderItemList();
  renderEditor();
  setStatus('PDF source cleared.');
}

function addBook() {
  persistEditorState();
  persistBookMetaState();
  const title = `Book ${state.books.length + 1}`;
  const book = createBook({ title });
  state.books.push(book);
  state.activeBookId = book.id;
  syncActiveContentFromBook();
  state.selection = { kind: 'fixed', key: 'frontCover' };
  renderBookList();
  renderPdfPanel();
  renderItemList();
  renderEditor();
  setStatus(`${title} added.`);
}

function removeActiveBook() {
  const index = activeBookIndex();
  if (state.books.length <= 1 || index < 0) {
    return;
  }

  const book = currentBook();
  if (!window.confirm(`Remove ${book.title || 'this book'} from the shelf?`)) {
    return;
  }

  persistEditorState();
  persistBookMetaState();
  state.books.splice(index, 1);
  const nextBook = state.books[Math.min(index, state.books.length - 1)];
  state.activeBookId = nextBook?.id || '';
  syncActiveContentFromBook();
  state.selection = { kind: 'fixed', key: 'frontCover' };
  renderBookList();
  renderPdfPanel();
  renderItemList();
  renderEditor();
  setStatus('Book removed.');
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
  state.quill.insertEmbed(
    range.index,
    'richImage',
    {
      assetPath: uploaded.assetPath,
      url: uploaded.url,
      layout: 'center',
      width: 60
    },
    'user'
  );
  state.quill.setSelection(range.index, 1, 'user');
  schedulePositionSelectedImageControls();
  scheduleOverflowCheck();
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

function createContinuationTitle(baseTitle, index) {
  const trimmed = String(baseTitle || '').trim();
  if (!trimmed) {
    return index === 1 ? 'Continuation' : `Continuation ${index}`;
  }

  return index === 1 ? `${trimmed} (cont.)` : `${trimmed} (cont. ${index})`;
}

function splitOverflowIntoPages() {
  const page = currentItem();
  if (!page || page.type !== 'document') {
    return;
  }

  persistEditorState();
  const fragments =
    state.overflowFragments ||
    window.richContentRuntime.paginatePreparedHtml(page.html || '<p></p>', els.paginationLab);

  if (fragments.length <= 1) {
    setStatus('This page fits in one app page.');
    return;
  }

  page.html = fragments[0];
  const currentIndex = selectionIndex();
  const additions = fragments.slice(1).map((fragment, offset) =>
    createDocumentPage({
      title: createContinuationTitle(page.title, offset + 1),
      html: fragment
    })
  );

  state.content.pages.splice(currentIndex + 1, 0, ...additions);
  renderBookList();
  renderItemList();
  renderEditor();
  setStatus(`Created ${additions.length} continuation page(s).`);
}

async function loadUsers() {
  if (!canManageUsersInUi()) {
    return;
  }

  const payload = await request('/api/users');
  els.usersList.innerHTML = '';

  payload.users.forEach((user) => {
    const card = document.createElement('form');
    card.className = 'user-card';
    const isReadonly = !canManageTargetInUi(user);
    card.classList.toggle('readonly', isReadonly);
    const title = document.createElement('strong');
    title.textContent = `${user.displayName} (${roleLabel(user.role)})`;

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

    const roleFieldLabel = document.createElement('label');
    roleFieldLabel.textContent = 'Role';
    const roleSelect = document.createElement('select');
    roleSelect.name = 'role';
    ['editor', 'admin'].forEach((role) => {
      if (role === 'admin' && !canCreateAdminsInUi() && user.role !== 'admin') {
        return;
      }

      const option = document.createElement('option');
      option.value = role;
      option.textContent = roleLabel(role);
      option.selected = user.role === role;
      roleSelect.append(option);
    });
    roleFieldLabel.append(roleSelect);

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
    actions.append(saveButton, deleteButton);

    if (user.isBuiltin) {
      const note = document.createElement('small');
      note.textContent = 'Built-in superadmin credentials are controlled by build environment variables.';
      card.append(note);
    }

    card.append(
      title,
      usernameLabel,
      displayNameLabel,
      roleFieldLabel,
      passwordLabel,
      activeLabel,
      actions
    );

    [usernameInput, displayNameInput, roleSelect, passwordInput, activeSelect].forEach((field) => {
      field.disabled = isReadonly;
    });
    saveButton.disabled = isReadonly;
    deleteButton.disabled = isReadonly;

    card.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isReadonly) {
        return;
      }
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
      if (isReadonly) {
        return;
      }
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
        layout: normalizeLayout(node.dataset.layout),
        width: Number(node.dataset.width || 60)
      };
    }

    static apply(node, value = {}) {
      const layout = normalizeLayout(value.layout);
      const width = Number(value.width || 60);

      node.setAttribute('contenteditable', 'false');
      node.dataset.layout = layout;
      node.dataset.width = String(width);
      node.style.width = `${width}%`;

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
        layout: normalizeLayout(this.domNode.dataset.layout),
        width: this.domNode.dataset.width || '60'
      };
    }

    format(name, value) {
      if (name === 'layout') {
        this.domNode.dataset.layout = normalizeLayout(value);
        return;
      }

      if (name === 'width') {
        const nextValue = Math.max(20, Math.min(100, Number(value || 60)));
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
  state.quill.on('selection-change', () => {
    schedulePositionSelectedImageControls();
  });
  state.quill.on('text-change', () => {
    scheduleOverflowCheck();
    schedulePositionSelectedImageControls();
  });
  state.quill.root.addEventListener('click', (event) => {
    const figure = event.target.closest('figure.rich-image');
    if (!figure) {
      schedulePositionSelectedImageControls();
      return;
    }

    const blot = Quill.find(figure);
    const index = state.quill.getIndex(blot);
    state.quill.setSelection(index, 1, 'user');
    schedulePositionSelectedImageControls();
  });
}

function setSelectedImageLayout(layout) {
  const figure = selectedRichImageFigure();
  if (!figure) {
    return;
  }

  const blot = Quill.find(figure);
  blot.format('layout', layout);
  schedulePositionSelectedImageControls();
  scheduleOverflowCheck();
}

function deleteSelectedImage() {
  const figure = selectedRichImageFigure();
  if (!figure) {
    return;
  }

  const blot = Quill.find(figure);
  const index = state.quill.getIndex(blot);
  state.quill.deleteText(index, 1, 'user');
  hideSelectedImageControls();
  scheduleOverflowCheck();
}

function startImageResize(event) {
  event.preventDefault();
  const figure = selectedRichImageFigure();
  if (!figure) {
    return;
  }

  const contentRect = state.quill.root.getBoundingClientRect();
  state.resizeSession = {
    startX: event.clientX,
    startWidth: Number(figure.dataset.width || 60),
    contentWidth: Math.max(1, contentRect.width)
  };

  const onMove = (moveEvent) => {
    if (!state.resizeSession) {
      return;
    }

    const deltaX = moveEvent.clientX - state.resizeSession.startX;
    const nextWidth = Math.max(
      20,
      Math.min(100, state.resizeSession.startWidth + (deltaX / state.resizeSession.contentWidth) * 100)
    );
    const blot = Quill.find(figure);
    blot.format('width', Math.round(nextWidth));
    schedulePositionSelectedImageControls();
    scheduleOverflowCheck();
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    state.resizeSession = null;
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
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
  document.getElementById('logoutButton').classList.remove('hidden');
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

  els.addBookButton.addEventListener('click', addBook);

  els.moveBookUpButton.addEventListener('click', () => {
    const index = activeBookIndex();
    if (index > 0) {
      moveBook(index, index - 1);
    }
  });

  els.moveBookDownButton.addEventListener('click', () => {
    const index = activeBookIndex();
    if (index >= 0 && index < state.books.length - 1) {
      moveBook(index, index + 1);
    }
  });

  els.removeBookButton.addEventListener('click', removeActiveBook);

  els.bookTitleInput.addEventListener('input', () => {
    persistBookMetaState();
    renderBookList({ updateDetails: false });
  });

  els.bookDescriptionInput.addEventListener('input', () => {
    persistBookMetaState();
  });

  els.bookSideViewColorInput.addEventListener('input', () => {
    els.bookSideViewColorCodeInput.value = els.bookSideViewColorInput.value;
    persistBookTintState();
  });

  els.bookSideViewColorCodeInput.addEventListener('input', () => {
    const color = normalizeColorCode(els.bookSideViewColorCodeInput.value);
    els.bookSideViewColorCodeInput.setCustomValidity(color ? '' : 'Use a hex color like #c8b79b.');
    if (color) {
      persistBookTintState();
    }
  });

  els.bookSideViewColorCodeInput.addEventListener('blur', () => {
    const book = currentBook();
    const color = normalizeHexColor(book?.sideViewColor, '#c8b79b');
    els.bookSideViewColorInput.value = color;
    els.bookSideViewColorCodeInput.value = color;
    els.bookSideViewColorCodeInput.setCustomValidity('');
  });

  els.bookSideViewOpacityInput.addEventListener('input', () => {
    persistBookTintState();
  });

  els.clearBookSideViewTintButton.addEventListener('click', () => {
    clearBookTintState();
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
    renderBookList();
    renderItemList();
    renderEditor();
  });

  document.getElementById('addImagePageButton').addEventListener('click', () => {
    persistEditorState();
    state.content.pages.push(createImagePage());
    state.selection = { kind: 'page', index: state.content.pages.length - 1 };
    renderBookList();
    renderItemList();
    renderEditor();
  });

  document.getElementById('saveContentButton').addEventListener('click', saveContent);

  els.pdfDropZone.addEventListener('click', () => {
    els.pdfUploadInput.click();
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    els.pdfDropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.pdfDropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    els.pdfDropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.pdfDropZone.classList.remove('drag-over');
    });
  });

  els.pdfDropZone.addEventListener('drop', async (event) => {
    const [file] = event.dataTransfer?.files || [];
    if (file) {
      try {
        await importPdfFile(file);
      } catch (error) {
        setStatus(error.message);
      }
    }
  });

  els.pdfUploadInput.addEventListener('change', async () => {
    const [file] = els.pdfUploadInput.files || [];
    els.pdfUploadInput.value = '';
    if (file) {
      try {
        await importPdfFile(file);
      } catch (error) {
        setStatus(error.message);
      }
    }
  });

  els.removePdfButton.addEventListener('click', async () => {
    try {
      await clearPdfSource();
    } catch (error) {
      setStatus(error.message);
    }
  });

  els.moveUpButton.addEventListener('click', () => {
    const index = selectionIndex();
    if (index > 0) {
      movePage(index, index - 1);
    }
  });

  els.moveDownButton.addEventListener('click', () => {
    const index = selectionIndex();
    if (index >= 0 && index < state.content.pages.length - 1) {
      movePage(index, index + 1);
    }
  });

  els.removeItemButton.addEventListener('click', () => {
    const index = selectionIndex();
    if (index < 0) {
      return;
    }

    state.content.pages.splice(index, 1);
    state.selection = state.content.pages.length
      ? { kind: 'page', index: Math.max(0, index - 1) }
      : { kind: 'fixed', key: 'frontCover' };
    renderBookList();
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
    scheduleOverflowCheck();
  });

  els.alignImageLeftButton.addEventListener('click', () => {
    setSelectedImageLayout('left');
  });

  els.alignImageCenterButton.addEventListener('click', () => {
    setSelectedImageLayout('center');
  });

  els.alignImageRightButton.addEventListener('click', () => {
    setSelectedImageLayout('right');
  });

  document.getElementById('removeSelectedImageButton').addEventListener('click', deleteSelectedImage);
  els.selectedImageResizeHandle.addEventListener('pointerdown', startImageResize);
  els.splitOverflowButton.addEventListener('click', splitOverflowIntoPages);

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

  window.addEventListener('resize', () => {
    updateEditorPageMetrics();
    schedulePositionSelectedImageControls();
    scheduleOverflowCheck();
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
