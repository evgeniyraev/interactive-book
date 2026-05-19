const path = require('node:path');
const fs = require('node:fs/promises');
const fse = require('fs-extra');
const { dialog } = require('electron');
const {
  getConfig,
  setConfig,
  getDataRoot,
  ensureDataDirectories,
  computeLocalContentHash,
  saveConfigSnapshot
} = require('./configManager');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);
const PDF_EXTENSION = '.pdf';

function toPortablePath(value) {
  return value.split(path.sep).join('/');
}

function fromPortablePath(value) {
  return value.split('/').join(path.sep);
}

function resolveDataPath(relativePath) {
  if (!relativePath) {
    return '';
  }

  const root = path.resolve(getDataRoot());
  const resolved = path.resolve(root, fromPortablePath(relativePath));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid data path.');
  }

  return resolved;
}

function sanitizeAssetFileName(fileName, fallbackExt = '') {
  const baseName = path.basename(String(fileName || '')).replace(/\u0000/g, '');
  const ext = path.extname(baseName);
  const nameWithoutExt = path.basename(baseName, ext);
  const safeName = nameWithoutExt || 'asset';
  const safeExt = ext || fallbackExt || '';
  return `${safeName}${safeExt}`;
}

async function createUniqueAssetRelativePath(preferredFileName) {
  await ensureDataDirectories();

  const candidate = path.basename(preferredFileName || 'asset');
  const ext = path.extname(candidate);
  const baseName = path.basename(candidate, ext) || 'asset';

  let suffix = 0;
  while (true) {
    const numbered = suffix === 0 ? `${baseName}${ext}` : `${baseName}-${suffix + 1}${ext}`;
    const assetsRelativePath = toPortablePath(path.join('assets', numbered));
    const destination = resolveDataPath(assetsRelativePath);
    if (!(await fse.pathExists(destination))) {
      return assetsRelativePath;
    }

    suffix += 1;
  }
}

async function copyFileToAssets(filePath) {
  const fileName = sanitizeAssetFileName(path.basename(filePath), path.extname(filePath));
  const assetsRelativePath = await createUniqueAssetRelativePath(fileName);
  const destination = resolveDataPath(assetsRelativePath);

  await fse.copy(filePath, destination, { overwrite: true });
  return assetsRelativePath;
}

function isImageFilePath(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function copyManyFilesToAssets(filePaths) {
  const imported = [];
  for (const filePath of filePaths) {
    if (!isImageFilePath(filePath)) {
      continue;
    }

    imported.push(await copyFileToAssets(filePath));
  }

  return imported;
}

function normalizeImageExtension(fileName = '') {
  const ext = path.extname(fileName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return ext;
  }

  return '.png';
}

function normalizeBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(bytes));
  }

  if (Buffer.isBuffer(bytes)) {
    return bytes;
  }

  return null;
}

async function copyManyBuffersToAssets(files) {
  const imported = [];
  for (const file of files) {
    const ext = normalizeImageExtension(file?.name || '');
    const fileName = sanitizeAssetFileName(file?.name || '', ext);
    const buffer = normalizeBuffer(file?.data);

    if (!buffer) {
      continue;
    }

    const assetsRelativePath = await createUniqueAssetRelativePath(fileName);
    const destination = resolveDataPath(assetsRelativePath);
    await fs.writeFile(destination, buffer);
    imported.push(assetsRelativePath);
  }

  return imported;
}

async function copyPdfBufferToAssets(file) {
  const buffer = normalizeBuffer(file?.data);
  if (!buffer?.length) {
    throw new Error('The uploaded PDF is empty.');
  }

  const fileName = sanitizeAssetFileName(file?.name || 'book.pdf', PDF_EXTENSION);
  if (path.extname(fileName).toLowerCase() !== PDF_EXTENSION) {
    throw new Error('Upload a .pdf file.');
  }

  if (!buffer.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
    throw new Error('The uploaded file does not look like a valid PDF.');
  }

  const assetsRelativePath = await createUniqueAssetRelativePath(fileName);
  const destination = resolveDataPath(assetsRelativePath);
  await fs.writeFile(destination, buffer);
  return assetsRelativePath;
}

async function readAssetBuffer(relativePath) {
  if (!String(relativePath || '').startsWith('assets/')) {
    throw new Error('Only stored assets can be read.');
  }

  return fs.readFile(resolveDataPath(relativePath));
}

async function pickFileAndCopy(options = {}) {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options.filters || []
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return copyFileToAssets(result.filePaths[0]);
}

async function exportPackage() {
  const config = getConfig();
  const root = getDataRoot();

  const dirResult = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });

  if (dirResult.canceled || dirResult.filePaths.length === 0) {
    return { canceled: true };
  }

  const exportRoot = path.join(dirResult.filePaths[0], 'interactive-book-export');
  await fse.ensureDir(exportRoot);
  await fse.copy(root, path.join(exportRoot, 'book-data'), { overwrite: true });

  await saveConfigSnapshot(config);
  await fs.writeFile(
    path.join(exportRoot, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );

  const hash = await computeLocalContentHash(config);
  const manifest = {
    schemaVersion: 1,
    hash,
    exportedAt: new Date().toISOString()
  };

  await fs.writeFile(
    path.join(exportRoot, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  return { canceled: false, exportRoot, hash };
}

async function importPackageFromFolder(folderPath) {
  const configPath = path.join(folderPath, 'config.json');
  const dataPath = path.join(folderPath, 'book-data');
  const manifestPath = path.join(folderPath, 'manifest.json');

  const [configExists, dataExists] = await Promise.all([
    fse.pathExists(configPath),
    fse.pathExists(dataPath)
  ]);

  if (!configExists || !dataExists) {
    throw new Error('Invalid import package. Missing config.json or book-data directory.');
  }

  const configRaw = await fs.readFile(configPath, 'utf8');
  const importedConfig = JSON.parse(configRaw);

  const targetRoot = getDataRoot();
  await fse.emptyDir(targetRoot);
  await fse.copy(dataPath, targetRoot, { overwrite: true });

  const merged = setConfig(importedConfig);

  let importedHash = '';
  if (await fse.pathExists(manifestPath)) {
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    importedHash = manifest.hash || '';
  }

  if (!importedHash) {
    importedHash = await computeLocalContentHash(merged);
  }

  setConfig({
    autoupdate: {
      ...merged.autoupdate,
      lastImportedHash: importedHash
    }
  });

  return {
    importedHash,
    config: getConfig()
  };
}

async function importPackageByDialog() {
  const dirResult = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (dirResult.canceled || dirResult.filePaths.length === 0) {
    return { canceled: true };
  }

  return {
    canceled: false,
    ...(await importPackageFromFolder(dirResult.filePaths[0]))
  };
}

async function readExternalManifest(baseFolder) {
  const manifestPath = path.join(baseFolder, 'interactive-book-export', 'manifest.json');
  const exists = await fse.pathExists(manifestPath);

  if (!exists) {
    return null;
  }

  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  return {
    folderPath: path.join(baseFolder, 'interactive-book-export'),
    hash: manifest.hash || ''
  };
}

module.exports = {
  pickFileAndCopy,
  copyManyFilesToAssets,
  copyManyBuffersToAssets,
  copyPdfBufferToAssets,
  readAssetBuffer,
  resolveDataPath,
  exportPackage,
  importPackageByDialog,
  importPackageFromFolder,
  readExternalManifest
};
