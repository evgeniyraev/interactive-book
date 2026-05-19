const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { app } = require('electron');
const { defaultConfig } = require('../shared/defaultConfig');
const { normalizeContent, normalizeBooks } = require('../shared/contentModel');

let cachedConfig = null;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function pickActiveBookId(preferredId, books) {
  const normalizedId = String(preferredId || '');
  if (normalizedId && books.some((book) => book.id === normalizedId)) {
    return normalizedId;
  }

  return books[0]?.id || '';
}

function activeContentFor(books, activeBookId, fallbackContent) {
  const activeBook = books.find((book) => book.id === activeBookId) || books[0];
  return activeBook?.content || normalizeContent(fallbackContent || defaultConfig.content);
}

function normalizeLibrary(config = {}) {
  const legacyContent = config?.content || defaultConfig.content;
  const books = normalizeBooks(config?.books, legacyContent);
  const activeBookId = pickActiveBookId(config?.activeBookId, books);

  return {
    books,
    activeBookId,
    content: activeContentFor(books, activeBookId, legacyContent)
  };
}

function mergeWithDefaults(config) {
  const library = normalizeLibrary(config);

  return {
    ...defaultConfig,
    ...config,
    mode: {
      ...defaultConfig.mode,
      ...(config?.mode || {})
    },
    design: {
      ...defaultConfig.design,
      ...(config?.design || {}),
      page: {
        ...defaultConfig.design.page,
        ...(config?.design?.page || {})
      }
    },
    content: library.content,
    books: library.books,
    activeBookId: library.activeBookId,
    autoupdate: {
      ...defaultConfig.autoupdate,
      ...(config?.autoupdate || {})
    },
    adminServer: {
      ...defaultConfig.adminServer,
      ...(config?.adminServer || {})
    }
  };
}

function getDataRoot() {
  return path.join(app.getPath('userData'), 'book-data');
}

function getConfigStoragePath() {
  return path.join(getDataRoot(), 'config.json');
}

async function ensureDataDirectories() {
  const root = getDataRoot();
  const assetsDir = path.join(root, 'assets');
  await fsp.mkdir(assetsDir, { recursive: true });

  const configPath = getConfigStoragePath();
  let createdConfig = false;
  if (!fs.existsSync(configPath)) {
    await fsp.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    createdConfig = true;
  }

  return { root, assetsDir, createdConfig };
}

function loadConfigFromDisk() {
  try {
    const raw = fs.readFileSync(getConfigStoragePath(), 'utf8');
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return mergeWithDefaults(defaultConfig);
  }
}

function persistConfig(config) {
  const merged = mergeWithDefaults(config);
  fs.writeFileSync(getConfigStoragePath(), JSON.stringify(merged, null, 2), 'utf8');
  cachedConfig = merged;
  return merged;
}

function getConfig() {
  if (cachedConfig) {
    return mergeWithDefaults(cachedConfig);
  }

  cachedConfig = loadConfigFromDisk();
  return mergeWithDefaults(cachedConfig);
}

function setConfig(partialConfig = {}) {
  const current = getConfig();
  const incomingHasBooks = hasOwn(partialConfig, 'books');
  const incomingHasContent = hasOwn(partialConfig, 'content');
  const incomingHasActiveBook = hasOwn(partialConfig, 'activeBookId');
  let library = {
    books: current.books,
    activeBookId: current.activeBookId,
    content: current.content
  };

  if (incomingHasBooks) {
    library = normalizeLibrary({
      books: partialConfig.books,
      activeBookId: incomingHasActiveBook ? partialConfig.activeBookId : current.activeBookId,
      content: incomingHasContent ? partialConfig.content : current.content
    });
  } else if (incomingHasContent) {
    const content = normalizeContent(partialConfig.content);
    const books = normalizeBooks(current.books, current.content);
    const activeBookId = pickActiveBookId(
      incomingHasActiveBook ? partialConfig.activeBookId : current.activeBookId,
      books
    );

    library = {
      books: books.map((book) => (
        book.id === activeBookId
          ? {
              ...book,
              content
            }
          : book
      )),
      activeBookId,
      content
    };
  } else if (incomingHasActiveBook) {
    const books = normalizeBooks(current.books, current.content);
    const activeBookId = pickActiveBookId(partialConfig.activeBookId, books);
    library = {
      books,
      activeBookId,
      content: activeContentFor(books, activeBookId, current.content)
    };
  }

  const next = mergeWithDefaults({
    ...current,
    ...partialConfig,
    mode: {
      ...current.mode,
      ...(partialConfig.mode || {})
    },
    design: {
      ...current.design,
      ...(partialConfig.design || {}),
      page: {
        ...current.design.page,
        ...(partialConfig.design?.page || {})
      }
    },
    content: library.content,
    books: library.books,
    activeBookId: library.activeBookId,
    autoupdate: {
      ...current.autoupdate,
      ...(partialConfig.autoupdate || {})
    },
    adminServer: {
      ...current.adminServer,
      ...(partialConfig.adminServer || {})
    }
  });

  return persistConfig(next);
}

function getConfigFilePath() {
  return path.join(getDataRoot(), 'config.export.json');
}

async function saveConfigSnapshot(config) {
  await ensureDataDirectories();
  await fsp.writeFile(getConfigFilePath(), JSON.stringify(config, null, 2), 'utf8');
}

async function computeLocalContentHash(config) {
  const dataDir = getDataRoot();
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(config));

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dataDir, fullPath);
      hash.update(relativePath);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const fileBuffer = await fsp.readFile(fullPath);
        hash.update(fileBuffer);
      }
    }
  }

  await walk(dataDir);
  return hash.digest('hex');
}

module.exports = {
  getConfig,
  setConfig,
  getDataRoot,
  ensureDataDirectories,
  getConfigFilePath,
  saveConfigSnapshot,
  computeLocalContentHash
};
