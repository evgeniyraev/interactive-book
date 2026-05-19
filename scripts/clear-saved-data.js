#!/usr/bin/env node

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SAVED_DATA_DIR = 'book-data';
const SUPPORTED_FLAGS = new Set(['--all', '--dry-run', '--help', '-h']);

function printHelp() {
  console.log(`Usage: npm run clear:data [-- --dry-run] [-- --all]

Clears InteractiveBook saved app data.

Options:
  --dry-run  Print the directories that would be cleared.
  --all      Clear the whole Electron userData directory instead of only ${SAVED_DATA_DIR}.
  --help     Show this help message.`);
}

function getAppDataRoot() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }

  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }

  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function normalizeAppName(value) {
  const appName = String(value || '').trim();
  if (!appName || appName.includes('/') || appName.includes('\\')) {
    return '';
  }

  return appName;
}

function getCandidateAppNames(packageJson) {
  return [
    packageJson?.build?.productName,
    packageJson?.productName,
    packageJson?.name
  ]
    .map(normalizeAppName)
    .filter(Boolean)
    .filter((appName, index, appNames) => appNames.indexOf(appName) === index);
}

function getTargets(appNames, clearWholeUserData) {
  const appDataRoot = getAppDataRoot();
  return appNames.map((appName) => {
    const userDataRoot = path.join(appDataRoot, appName);
    return clearWholeUserData ? userDataRoot : path.join(userDataRoot, SAVED_DATA_DIR);
  });
}

function assertSafeTarget(target, appNames) {
  const appDataRoot = path.resolve(getAppDataRoot());
  const resolvedTarget = path.resolve(target);
  const insideKnownAppDir = appNames.some((appName) => {
    const userDataRoot = path.resolve(appDataRoot, appName);
    return resolvedTarget === userDataRoot || resolvedTarget.startsWith(`${userDataRoot}${path.sep}`);
  });

  if (!insideKnownAppDir) {
    throw new Error(`Refusing to clear unexpected path: ${target}`);
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const unknownFlags = args.filter((arg) => !SUPPORTED_FLAGS.has(arg));
  if (unknownFlags.length) {
    console.error(`Unknown option: ${unknownFlags.join(', ')}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const packageJson = require(path.join(PROJECT_ROOT, 'package.json'));
  const appNames = getCandidateAppNames(packageJson);
  if (!appNames.length) {
    throw new Error('Could not resolve an app name from package.json.');
  }

  const clearWholeUserData = args.includes('--all');
  const dryRun = args.includes('--dry-run');
  const targets = getTargets(appNames, clearWholeUserData);
  const results = [];

  for (const target of targets) {
    assertSafeTarget(target, appNames);
    const exists = await pathExists(target);
    if (!dryRun && exists) {
      await fs.rm(target, { recursive: true, force: true });
    }
    results.push({ target, exists });
  }

  const scope = clearWholeUserData ? 'Electron userData' : 'saved app data';
  const action = dryRun ? 'Would clear' : 'Cleared';
  console.log(`${action} ${scope} for ${packageJson.build?.productName || packageJson.name}:`);

  for (const { target, exists } of results) {
    const status = exists ? 'found' : 'not found';
    console.log(`- ${target} (${status})`);
  }

  if (!dryRun) {
    console.log('The app will recreate default saved data on the next launch.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
