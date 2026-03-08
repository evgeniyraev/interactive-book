const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { app } = require('electron');
const { defaultConfig } = require('../shared/defaultConfig');

let cachedConfig = null;

function mergeWithDefaults(config) {
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
    content: {
      ...defaultConfig.content,
      ...(config?.content || {})
    },
    autoupdate: {
      ...defaultConfig.autoupdate,
      ...(config?.autoupdate || {})
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

function setConfig(partialConfig) {
  const current = getConfig();
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
    content: {
      ...current.content,
      ...(partialConfig.content || {})
    },
    autoupdate: {
      ...current.autoupdate,
      ...(partialConfig.autoupdate || {})
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
