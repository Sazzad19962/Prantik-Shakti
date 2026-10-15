'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');

const { validateContent } = require('./schema');
const { securityHeaders, hashPassword } = require('./security');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

// Content service shared by public + admin routes.
function createContentService(store, config) {
  let lock = Promise.resolve();
  let seedCache = null;

  function loadSeed() {
    if (!seedCache) {
      const raw = JSON.parse(fs.readFileSync(config.seedFile, 'utf8'));
      const { value, errors } = validateContent(raw);
      if (errors.length) throw new Error('Seed file is invalid:\n' + errors.join('\n'));
      seedCache = value;
    }
    return structuredClone(seedCache);
  }

  async function get() {
    const c = await store.getContent();
    return c || loadSeed();
  }

  // Serialised read-modify-write. mutator(content) may return { error } to abort.
  function update(mutator) {
    const run = async () => {
      const content = await get();
      const result = await mutator(content);
      if (result && result.abort) return result;
      await store.saveContent(content);
      return result || {};
    };
    const p = lock.then(run, run);
    lock = p.catch(() => {});
    return p;
  }

  async function audit(req, action, target) {
    await store.addAudit({
      id: crypto.randomBytes(12).toString('hex'),
      at: new Date().toISOString(),
      user: req.user ? req.user.username : '—',
      action, target: String(target || '').slice(0, 300),
      ip: req.ip,
    });
  }

  return { get, update, audit, loadSeed };
}

// Seed content and owner user when the store is empty.
async function bootstrap(store, config, contentSvc, log = console) {
  if (!(await store.getContent())) {
    await store.saveContent(contentSvc.loadSeed());
    log.info('[seed] খালি স্টোরে প্রাথমিক বিষয়বস্তু (seed.json) যোগ করা হয়েছে।');
  }
  const owner = await store.findUserByName(config.adminUsername);
  if (!owner) {
    if (!config.adminPassword) {
      if ((await store.countUsers()) === 0) throw new Error('ADMIN_PASSWORD সেট করা নেই এবং কোনো অ্যাডমিন ব্যবহারকারী নেই — সার্ভার চালু করা যাচ্ছে না।');
      log.warn('[auth] ADMIN_PASSWORD সেট করা নেই; বিদ্যমান ব্যবহারকারীরা লগইন করতে পারবেন।');
    } else {
      await store.addUser({
        id: crypto.randomBytes(12).toString('hex'),
        username: config.adminUsername, displayName: 'প্রধান অ্যাডমিন', role: 'owner',
        passwordHash: await hashPassword(config.adminPassword), createdAt: new Date().toISOString(),
      });
      log.info(`[auth] মালিক ব্যবহারকারী "${config.adminUsername}" তৈরি হয়েছে।`);
    }
  } else if (config.adminResetPassword && config.adminPassword) {
    await store.updateUser(owner.id, { passwordHash: await hashPassword(config.adminPassword), role: 'owner' });
    await store.deleteUserSessions(owner.id);
    log.warn(`[auth] ADMIN_RESET_PASSWORD: "${config.adminUsername}"-এর পাসওয়ার্ড পরিবেশ-চলক অনুযায়ী রিসেট হয়েছে। এখন ADMIN_RESET_PASSWORD সরিয়ে দিন।`);
  }
}

function createApp({ config, store }) {
  const app = express();
  const contentSvc = createContentService(store, config);

  app.disable('x-powered-by');
  let tp = config.trustProxy;
  if (typeof tp === 'string' && /^\d+$/.test(tp)) tp = Number(tp);
  if (tp) app.set('trust proxy', tp);

  app.use(securityHeaders(config.production));
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.production ? '1d' : 0, index: false }));
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false, limit: '300kb', parameterLimit: 500 }));

  app.get('/healthz', (req, res) => res.json({ ok: true, storage: store.kind }));

  app.use('/admin', adminRoutes({ config, store, contentSvc }));
  app.use(publicRoutes({ config, store, contentSvc }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) return res.status(413).type('text/plain; charset=utf-8').send('অনুরোধটি অনেক বড়।');
    if (err && err.status === 400) return res.status(400).type('text/plain; charset=utf-8').send('অবৈধ অনুরোধ।');
    console.error(err);
    res.status(500).type('text/plain; charset=utf-8').send('দুঃখিত, সার্ভারে একটি সমস্যা হয়েছে।');
  });

  app.locals.contentSvc = contentSvc;
  return app;
}

module.exports = { createApp, bootstrap, createContentService };
