const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { app } = require('electron');
const { getConfig, setConfig, getDataRoot } = require('./configManager');
const { copyManyBuffersToAssets, copyPdfBufferToAssets } = require('./contentManager');
const {
  canManageUsers,
  SESSION_COOKIE_NAME,
  bootstrapFirstAdmin,
  createUser,
  deleteUser,
  getUserById,
  hasUsers,
  listUsers,
  needsBootstrap,
  updateUser,
  verifyCredentials
} = require('./userManager');
const { normalizeBooks, normalizeContent } = require('../shared/contentModel');

function parseCookies(request) {
  const header = request.headers.cookie || '';
  const cookies = {};

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) {
      continue;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join('=') || '');
  }

  return cookies;
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    isBuiltin: Boolean(user.isBuiltin)
  };
}

function pickActiveBookId(preferredId, books) {
  const normalizedId = String(preferredId || '');
  if (normalizedId && books.some((book) => book.id === normalizedId)) {
    return normalizedId;
  }

  return books[0]?.id || '';
}

function libraryPayload(config) {
  const books = normalizeBooks(config.books, config.content);
  const activeBookId = pickActiveBookId(config.activeBookId, books);
  const activeBook = books.find((book) => book.id === activeBookId) || books[0];

  return {
    books,
    activeBookId,
    content: activeBook?.content || normalizeContent(config.content),
    design: {
      page: config.design.page,
      innerPagePadding: config.design.innerPagePadding,
      innerPagePaddingY: config.design.innerPagePaddingY,
      appBackgroundColor: config.design.appBackgroundColor
    }
  };
}

function updateBookContent(config, bookId, createNextContent) {
  const books = normalizeBooks(config.books, config.content);
  const activeBookId = pickActiveBookId(bookId || config.activeBookId, books);
  const nextBooks = books.map((book) => {
    if (book.id !== activeBookId) {
      return book;
    }

    return {
      ...book,
      content: normalizeContent(createNextContent(book.content))
    };
  });

  return {
    books: nextBooks,
    activeBookId
  };
}

class AdminServer {
  constructor(options = {}) {
    this.server = null;
    this.port = null;
    this.sessions = new Map();
    this.onContentSaved = options.onContentSaved || (() => {});
    this.onStateChanged = options.onStateChanged || (() => {});
  }

  isRunning() {
    return Boolean(this.server);
  }

  getUrl() {
    return this.port ? `http://127.0.0.1:${this.port}` : '';
  }

  async start(port) {
    if (this.server && this.port === port) {
      return { url: this.getUrl(), port: this.port };
    }

    if (this.server) {
      await this.stop();
    }

    const application = express();
    application.disable('x-powered-by');
    application.use(express.json({ limit: '250mb' }));

    application.use((request, response, next) => {
      const cookies = parseCookies(request);
      const token = cookies[SESSION_COOKIE_NAME];
      const session = token ? this.sessions.get(token) : null;
      request.sessionUserId = session?.userId || null;
      next();
    });

    const requireAuthenticated = async (request, response, next) => {
      if (!request.sessionUserId) {
        response.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const user = await getUserById(request.sessionUserId);
      if (!user || !user.isActive) {
        this.destroySessionByUserId(request.sessionUserId);
        response
          .status(401)
          .clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, sameSite: 'lax' })
          .json({ error: 'Authentication required.' });
        return;
      }

      request.currentUser = user;
      next();
    };

    const requireUserManager = async (request, response, next) => {
      await requireAuthenticated(request, response, async () => {
        if (!canManageUsers(request.currentUser)) {
          response.status(403).json({ error: 'Admin or superadmin access is required.' });
          return;
        }

        next();
      });
    };

    application.get('/api/bootstrap-status', async (_request, response) => {
      response.json({
        bootstrapRequired: needsBootstrap() && !(await hasUsers())
      });
    });

    application.post('/api/bootstrap-admin', async (request, response) => {
      try {
        const user = await bootstrapFirstAdmin(request.body || {});
        const token = this.createSession(user.id);
        response
          .cookie(SESSION_COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/'
          })
          .json({ user });
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
    });

    application.post('/api/login', async (request, response) => {
      const user = await verifyCredentials(request.body?.username, request.body?.password);
      if (!user) {
        response.status(401).json({ error: 'Invalid username or password.' });
        return;
      }

      const token = this.createSession(user.id);
      response
        .cookie(SESSION_COOKIE_NAME, token, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/'
        })
        .json({ user });
    });

    application.post('/api/logout', (request, response) => {
      if (request.sessionUserId) {
        this.destroySessionByUserId(request.sessionUserId);
      }

      response
        .clearCookie(SESSION_COOKIE_NAME, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/'
        })
        .json({ ok: true });
    });

    application.get('/api/session', requireAuthenticated, async (request, response) => {
      response.json({
        user: publicUser(request.currentUser)
      });
    });

    application.get('/api/content', requireAuthenticated, async (_request, response) => {
      response.json(libraryPayload(getConfig()));
    });

    application.put('/api/content', requireAuthenticated, async (request, response) => {
      try {
        const body = request.body || {};
        const update = Array.isArray(body.books)
          ? {
              books: normalizeBooks(body.books, getConfig().content),
              activeBookId: body.activeBookId
            }
          : {
              content: normalizeContent(body.content || {})
            };
        const updated = setConfig(update);
        this.onContentSaved(updated);
        response.json(libraryPayload(updated));
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
    });

    application.post('/api/content/pdf', requireAuthenticated, async (request, response) => {
      try {
        const file = request.body?.file || {};
        const assetPath = await copyPdfBufferToAssets({
          name: file?.name || 'book.pdf',
          data: Buffer.from(String(file?.dataBase64 || ''), 'base64')
        });

        const library = updateBookContent(
          getConfig(),
          request.body?.bookId,
          (currentContent) => ({
            ...currentContent,
            pdfSource: {
              assetPath,
              fileName: file?.name || path.basename(assetPath),
              importedAt: new Date().toISOString(),
              pageCount: 0
            }
          })
        );
        const updated = setConfig(library);
        this.onContentSaved(updated);
        response.json(libraryPayload(updated));
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
    });

    application.delete('/api/content/pdf', requireAuthenticated, async (request, response) => {
      try {
        const library = updateBookContent(
          getConfig(),
          request.query?.bookId,
          (currentContent) => ({
            ...currentContent,
            pdfSource: null
          })
        );
        const updated = setConfig(library);
        this.onContentSaved(updated);
        response.json(libraryPayload(updated));
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
    });

    application.post('/api/assets/import', requireAuthenticated, async (request, response) => {
      try {
        const files = Array.isArray(request.body?.files) ? request.body.files : [];
        const imported = await copyManyBuffersToAssets(
          files.map((file) => ({
            name: file?.name || 'image.png',
            data: Buffer.from(String(file?.dataBase64 || ''), 'base64')
          }))
        );

        response.json({
          imported,
          urls: imported.map((assetPath) => ({
            assetPath,
            url: `/assets/${assetPath.replace(/^assets\//, '')}`
          }))
        });
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
    });

    application.get('/api/users', requireUserManager, async (_request, response) => {
      response.json({
        users: await listUsers()
      });
    });

    application.post('/api/users', requireUserManager, async (request, response) => {
      try {
        const user = await createUser(request.currentUser, request.body || {});
        response.json({ user });
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
    });

    application.put('/api/users/:userId', requireUserManager, async (request, response) => {
      try {
        const user = await updateUser(request.currentUser, request.params.userId, request.body || {});
        response.json({ user });
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
    });

    application.delete('/api/users/:userId', requireUserManager, async (request, response) => {
      try {
        await deleteUser(request.currentUser, request.params.userId);
        this.destroySessionByUserId(request.params.userId);
        response.json({ ok: true });
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
    });

    application.use('/assets', express.static(path.join(getDataRoot(), 'assets')));
    application.use(
      '/vendor/quill',
      express.static(path.join(app.getAppPath(), 'node_modules/quill/dist'))
    );
    application.use('/shared', express.static(path.join(__dirname, '../shared')));
    application.use('/renderer-static', express.static(path.join(__dirname, '../renderer')));
    application.use('/admin', express.static(path.join(__dirname, '../admin')));
    application.get('/', (_request, response) => {
      response.redirect('/admin/');
    });

    application.use((error, _request, response, _next) => {
      response.status(500).json({ error: error.message || 'Unexpected server error.' });
    });

    await new Promise((resolve, reject) => {
      const server = application.listen(port, '127.0.0.1', () => {
        this.server = server;
        this.port = port;
        this.onStateChanged({ running: true, url: this.getUrl(), port: this.port });
        resolve();
      });

      server.on('error', reject);
    });

    return {
      url: this.getUrl(),
      port: this.port
    };
  }

  async stop() {
    if (!this.server) {
      return;
    }

    const activeServer = this.server;
    this.server = null;
    this.port = null;
    this.sessions.clear();

    await new Promise((resolve, reject) => {
      activeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    this.onStateChanged({ running: false, url: '', port: null });
  }

  createSession(userId) {
    const token = crypto.randomBytes(24).toString('hex');
    this.sessions.set(token, { userId, createdAt: Date.now() });
    return token;
  }

  destroySessionByUserId(userId) {
    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(token);
      }
    }
  }
}

module.exports = {
  AdminServer
};
