const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { getDataRoot, ensureDataDirectories } = require('./configManager');
const { buildEnv } = require('../shared/buildEnv');

const ROLE_SUPERADMIN = 'superadmin';
const ROLE_ADMIN = 'admin';
const ROLE_EDITOR = 'editor';
const USER_ID_SUPERADMIN = 'builtin-superadmin';
const SESSION_COOKIE_NAME = 'interactive_book_admin_session';

function getUsersStoragePath() {
  return path.join(getDataRoot(), 'admin-users.json');
}

async function readStoredUsers() {
  await ensureDataDirectories();

  try {
    const raw = await fs.readFile(getUsersStoragePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

async function writeStoredUsers(users) {
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

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validateManagedPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function validateRole(role) {
  return role === ROLE_SUPERADMIN || role === ROLE_ADMIN || role === ROLE_EDITOR;
}

function roleLabel(role) {
  if (role === ROLE_SUPERADMIN) {
    return 'superadmin';
  }

  if (role === ROLE_ADMIN) {
    return 'admin';
  }

  return 'writer';
}

function getBuiltInSuperadmin() {
  const username = normalizeUsername(buildEnv.superadminUsername);
  const password = String(buildEnv.superadminPassword || '');

  if (!username || !password) {
    return null;
  }

  const salt = String(buildEnv.superadminSalt || 'interactive-book-superadmin');
  const now = new Date().toISOString();

  return {
    id: USER_ID_SUPERADMIN,
    username,
    displayName: String(buildEnv.superadminDisplayName || 'Superadmin').trim() || 'Superadmin',
    role: ROLE_SUPERADMIN,
    isActive: true,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
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
    isBuiltin: Boolean(user.isBuiltin),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function getAllUsers() {
  const storedUsers = await readStoredUsers();
  const builtInSuperadmin = getBuiltInSuperadmin();
  return builtInSuperadmin ? [builtInSuperadmin, ...storedUsers] : storedUsers;
}

function canManageUsers(user) {
  return user?.role === ROLE_SUPERADMIN || user?.role === ROLE_ADMIN;
}

function canAssignRole(actor, role) {
  if (!canManageUsers(actor)) {
    return false;
  }

  if (actor.role === ROLE_SUPERADMIN) {
    return role === ROLE_ADMIN || role === ROLE_EDITOR;
  }

  return role === ROLE_EDITOR;
}

function canManageTarget(actor, targetUser) {
  if (!canManageUsers(actor) || !targetUser) {
    return false;
  }

  if (targetUser.isBuiltin) {
    return false;
  }

  if (actor.role === ROLE_SUPERADMIN) {
    return targetUser.role === ROLE_ADMIN || targetUser.role === ROLE_EDITOR;
  }

  return targetUser.role === ROLE_EDITOR;
}

function assertCanAssignRole(actor, role) {
  if (!canAssignRole(actor, role)) {
    if (role === ROLE_ADMIN) {
      throw new Error('Only superadmin can create or promote admins.');
    }

    throw new Error(`Only admins can create ${roleLabel(role)} accounts.`);
  }
}

function assertCanManageTarget(actor, targetUser) {
  if (!canManageTarget(actor, targetUser)) {
    throw new Error('You do not have permission to manage this user.');
  }
}

async function hasUsers() {
  const users = await getAllUsers();
  return users.length > 0;
}

function needsBootstrap() {
  return !getBuiltInSuperadmin();
}

async function listUsers() {
  const users = await getAllUsers();
  return users.map(withoutSecrets);
}

async function getUserById(userId) {
  const users = await getAllUsers();
  return users.find((user) => user.id === userId) || null;
}

async function getUserByUsername(username) {
  const users = await getAllUsers();
  const normalized = normalizeUsername(username);
  return users.find((user) => normalizeUsername(user.username) === normalized) || null;
}

async function bootstrapFirstAdmin({ username, displayName, password }) {
  if (getBuiltInSuperadmin()) {
    throw new Error('Bootstrap is disabled when a built-in superadmin is configured.');
  }

  const users = await readStoredUsers();
  if (users.length > 0) {
    throw new Error('Admin users are already configured.');
  }

  if (!validateManagedPassword(password)) {
    throw new Error('Password must be at least 8 characters.');
  }

  const normalized = normalizeUsername(username);
  if (!normalized) {
    throw new Error('Username is required.');
  }

  const now = new Date().toISOString();
  const nextUser = {
    id: crypto.randomUUID(),
    username: normalized,
    displayName: String(displayName || username || 'Administrator').trim(),
    role: ROLE_ADMIN,
    isActive: true,
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
    ...makePasswordRecord(password)
  };

  await writeStoredUsers([nextUser]);
  return withoutSecrets(nextUser);
}

async function createUser(actor, { username, displayName, password, role = ROLE_EDITOR, isActive = true }) {
  assertCanAssignRole(actor, role);

  const users = await getAllUsers();
  const storedUsers = await readStoredUsers();
  const normalized = normalizeUsername(username);

  if (!normalized) {
    throw new Error('Username is required.');
  }

  if (!validateManagedPassword(password)) {
    throw new Error('Password must be at least 8 characters.');
  }

  if (!validateRole(role) || role === ROLE_SUPERADMIN) {
    throw new Error('Role must be admin or writer.');
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
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
    ...makePasswordRecord(password)
  };

  storedUsers.push(nextUser);
  await writeStoredUsers(storedUsers);
  return withoutSecrets(nextUser);
}

async function updateUser(actor, userId, updates = {}) {
  const storedUsers = await readStoredUsers();
  const index = storedUsers.findIndex((user) => user.id === userId);
  if (index === -1) {
    const builtInUser = await getUserById(userId);
    if (builtInUser?.isBuiltin) {
      throw new Error('Built-in superadmin credentials are controlled by environment variables.');
    }

    throw new Error('User not found.');
  }

  const current = storedUsers[index];
  assertCanManageTarget(actor, current);

  const nextRole = updates.role == null ? current.role : updates.role;
  const nextIsActive = updates.isActive == null ? current.isActive : Boolean(updates.isActive);
  const nextUsername = updates.username == null ? current.username : normalizeUsername(updates.username);

  if (!nextUsername) {
    throw new Error('Username is required.');
  }

  if (!validateRole(nextRole) || nextRole === ROLE_SUPERADMIN) {
    throw new Error('Role must be admin or writer.');
  }

  assertCanAssignRole(actor, nextRole);

  const allUsers = await getAllUsers();
  if (
    allUsers.some(
      (user) => user.id !== userId && normalizeUsername(user.username) === normalizeUsername(nextUsername)
    )
  ) {
    throw new Error('Username already exists.');
  }

  const activeAdminCount = storedUsers.filter((user) => user.role === ROLE_ADMIN && user.isActive).length;
  const requireLocalAdmin = !getBuiltInSuperadmin();
  if (
    requireLocalAdmin &&
    current.role === ROLE_ADMIN &&
    current.isActive &&
    (!nextIsActive || nextRole !== ROLE_ADMIN) &&
    activeAdminCount <= 1
  ) {
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
    if (!validateManagedPassword(updates.password)) {
      throw new Error('Password must be at least 8 characters.');
    }

    Object.assign(updated, makePasswordRecord(updates.password));
  }

  storedUsers[index] = updated;
  await writeStoredUsers(storedUsers);
  return withoutSecrets(updated);
}

async function deleteUser(actor, userId) {
  const storedUsers = await readStoredUsers();
  const user = storedUsers.find((entry) => entry.id === userId);
  if (!user) {
    const builtInUser = await getUserById(userId);
    if (builtInUser?.isBuiltin) {
      throw new Error('Built-in superadmin cannot be deleted.');
    }

    throw new Error('User not found.');
  }

  assertCanManageTarget(actor, user);

  const activeAdminCount = storedUsers.filter((entry) => entry.role === ROLE_ADMIN && entry.isActive).length;
  const requireLocalAdmin = !getBuiltInSuperadmin();
  if (requireLocalAdmin && user.role === ROLE_ADMIN && user.isActive && activeAdminCount <= 1) {
    throw new Error('At least one active admin user is required.');
  }

  await writeStoredUsers(storedUsers.filter((entry) => entry.id !== userId));
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
  ROLE_ADMIN,
  ROLE_EDITOR,
  ROLE_SUPERADMIN,
  SESSION_COOKIE_NAME,
  bootstrapFirstAdmin,
  canManageUsers,
  createUser,
  deleteUser,
  getBuiltInSuperadmin,
  getUserById,
  hasUsers,
  listUsers,
  needsBootstrap,
  updateUser,
  verifyCredentials
};
