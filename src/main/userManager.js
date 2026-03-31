const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { getDataRoot, ensureDataDirectories } = require('./configManager');

const DEFAULT_ROLE = 'admin';
const SESSION_COOKIE_NAME = 'interactive_book_admin_session';

function getUsersStoragePath() {
  return path.join(getDataRoot(), 'admin-users.json');
}

async function readUsers() {
  await ensureDataDirectories();

  try {
    const raw = await fs.readFile(getUsersStoragePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await ensureDataDirectories();
  await fs.writeFile(
    getUsersStoragePath(),
    JSON.stringify({ users }, null, 2),
    'utf8'
  );
}

function createSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
}

function makePasswordRecord(password) {
  const salt = createSalt();
  return {
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt)
  };
}

function withoutSecrets(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function validateRole(role) {
  return role === 'admin' || role === 'editor';
}

async function hasUsers() {
  const users = await readUsers();
  return users.length > 0;
}

async function listUsers() {
  const users = await readUsers();
  return users.map(withoutSecrets);
}

async function getUserById(userId) {
  const users = await readUsers();
  return users.find((user) => user.id === userId) || null;
}

async function getUserByUsername(username) {
  const users = await readUsers();
  const normalized = normalizeUsername(username);
  return users.find((user) => normalizeUsername(user.username) === normalized) || null;
}

async function bootstrapFirstAdmin({ username, displayName, password }) {
  const users = await readUsers();
  if (users.length > 0) {
    throw new Error('Admin users are already configured.');
  }

  if (!validatePassword(password)) {
    throw new Error('Password must be at least 8 characters.');
  }

  const now = new Date().toISOString();
  const nextUser = {
    id: crypto.randomUUID(),
    username: normalizeUsername(username),
    displayName: String(displayName || username || 'Administrator').trim(),
    role: DEFAULT_ROLE,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...makePasswordRecord(password)
  };

  if (!nextUser.username) {
    throw new Error('Username is required.');
  }

  await writeUsers([nextUser]);
  return withoutSecrets(nextUser);
}

async function createUser({ username, displayName, password, role = 'editor', isActive = true }) {
  const users = await readUsers();
  const normalized = normalizeUsername(username);

  if (!normalized) {
    throw new Error('Username is required.');
  }

  if (!validatePassword(password)) {
    throw new Error('Password must be at least 8 characters.');
  }

  if (!validateRole(role)) {
    throw new Error('Role must be admin or editor.');
  }

  if (users.some((user) => normalizeUsername(user.username) === normalized)) {
    throw new Error('Username already exists.');
  }

  const now = new Date().toISOString();
  const nextUser = {
    id: crypto.randomUUID(),
    username: normalized,
    displayName: String(displayName || normalized).trim(),
    role,
    isActive: Boolean(isActive),
    createdAt: now,
    updatedAt: now,
    ...makePasswordRecord(password)
  };

  users.push(nextUser);
  await writeUsers(users);
  return withoutSecrets(nextUser);
}

async function updateUser(userId, updates = {}) {
  const users = await readUsers();
  const index = users.findIndex((user) => user.id === userId);
  if (index === -1) {
    throw new Error('User not found.');
  }

  const current = users[index];
  const nextRole = updates.role == null ? current.role : updates.role;
  const nextIsActive = updates.isActive == null ? current.isActive : Boolean(updates.isActive);
  const nextUsername = updates.username == null ? current.username : normalizeUsername(updates.username);

  if (!nextUsername) {
    throw new Error('Username is required.');
  }

  if (!validateRole(nextRole)) {
    throw new Error('Role must be admin or editor.');
  }

  if (
    users.some(
      (user) =>
        user.id !== userId && normalizeUsername(user.username) === normalizeUsername(nextUsername)
    )
  ) {
    throw new Error('Username already exists.');
  }

  const activeAdminCount = users.filter((user) => user.role === 'admin' && user.isActive).length;
  if (current.role === 'admin' && current.isActive && (!nextIsActive || nextRole !== 'admin') && activeAdminCount <= 1) {
    throw new Error('At least one active admin user is required.');
  }

  const updated = {
    ...current,
    username: nextUsername,
    displayName: String(updates.displayName ?? current.displayName).trim() || nextUsername,
    role: nextRole,
    isActive: nextIsActive,
    updatedAt: new Date().toISOString()
  };

  if (updates.password != null && updates.password !== '') {
    if (!validatePassword(updates.password)) {
      throw new Error('Password must be at least 8 characters.');
    }

    Object.assign(updated, makePasswordRecord(updates.password));
  }

  users[index] = updated;
  await writeUsers(users);
  return withoutSecrets(updated);
}

async function deleteUser(userId) {
  const users = await readUsers();
  const user = users.find((entry) => entry.id === userId);
  if (!user) {
    throw new Error('User not found.');
  }

  const activeAdminCount = users.filter((entry) => entry.role === 'admin' && entry.isActive).length;
  if (user.role === 'admin' && user.isActive && activeAdminCount <= 1) {
    throw new Error('At least one active admin user is required.');
  }

  await writeUsers(users.filter((entry) => entry.id !== userId));
}

async function verifyCredentials(username, password) {
  const user = await getUserByUsername(username);
  if (!user || !user.isActive) {
    return null;
  }

  const actualHash = Buffer.from(user.passwordHash, 'hex');
  const expectedHash = Buffer.from(hashPassword(password, user.passwordSalt), 'hex');

  if (actualHash.length !== expectedHash.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(actualHash, expectedHash)) {
    return null;
  }

  return withoutSecrets(user);
}

module.exports = {
  SESSION_COOKIE_NAME,
  bootstrapFirstAdmin,
  createUser,
  deleteUser,
  getUserById,
  hasUsers,
  listUsers,
  updateUser,
  verifyCredentials
};
