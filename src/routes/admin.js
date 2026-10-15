'use strict';

const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const { SCHEMA, SECTION_KEYS, SECTION_NAMES, validateField, validateContent, validateSections, mediaRefs, newId, isId, isMediaId } = require('../schema');
const { hashPassword, verifyPassword, burnPasswordCheck, randomToken, sign, unsign, safeEqual, RateLimiter } = require('../security');
const { prepareUpload, sniffType, decodeName, IMAGE_TYPES, ALL_TYPES } = require('../media');
const V = require('../views/admin');

const SID = 'psl_sid';
const LOGIN_CSRF = 'psl_lcsrf';
const FLASH = 'psl_flash';
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;

module.exports = function adminRoutes({ config, store, contentSvc }) {
  const router = express.Router();
  const secret = config.sessionSecret;

  const cookieBase = { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/admin' };

  // Brute-force protection: per IP and per username.
  const ipFailures = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
  const userFailures = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 20, fields: 300, fieldSize: 100 * 1024, parts: 400 } });
  const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024, files: 1, fields: 10 } });

  // ---- helpers ---------------------------------------------------------------
  function setFlash(res, type, msg, list) {
    res.cookie(FLASH, sign(Buffer.from(JSON.stringify({ type, msg, list: (list || []).slice(0, 30) })).toString('base64url'), secret), { ...cookieBase, maxAge: 60 * 1000 });
  }
  function takeFlash(req, res) {
    const v = unsign(req.cookies[FLASH], secret);
    if (req.cookies[FLASH]) res.clearCookie(FLASH, cookieBase);
    if (!v) return null;
    try { return JSON.parse(Buffer.from(v, 'base64url').toString('utf8')); } catch { return null; }
  }
  const back = (res, url, type, msg, list) => { setFlash(res, type, msg, list); res.redirect(303, url); };

  async function ctx(req, res) {
    const c = await contentSvc.get();
    return {
      user: req.user, csrf: req.session.csrf, flash: takeFlash(req, res),
      devWarning: config.usingDefaultPassword, unread: await store.countUnreadEnquiries(), siteName: c.site.nameBn,
    };
  }
  const send = (res, htmlStr, status = 200) => res.status(status).set('Cache-Control', 'no-store').type('html').send(htmlStr);

  async function mediaMap() { return new Map((await store.listMedia()).map((m) => [m.id, m])); }

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ---- session loading -----------------------------------------------------------
  router.use(wrap(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const sid = unsign(req.cookies[SID], secret);
    if (sid) {
      const s = await store.getSession(sid);
      if (s) {
        const user = await store.getUser(s.userId);
        if (user) { req.session = s; req.user = user; }
      }
    }
    next();
  }));

  // Reject cross-site requests outright (defence in depth on top of CSRF tokens).
  function sameOrigin(req) {
    const origin = req.get('origin');
    if (!origin) return true;
    try { return new URL(origin).host === req.get('host'); } catch { return false; }
  }

  // ---- login / logout -----------------------------------------------------------
  router.get('/login', wrap(async (req, res) => {
    if (req.user) return res.redirect(303, '/admin');
    const token = randomToken();
    res.cookie(LOGIN_CSRF, sign(token, secret), { ...cookieBase, maxAge: 2 * 3600 * 1000 });
    const c = await contentSvc.get();
    send(res, V.loginPage({ csrf: token, devWarning: config.usingDefaultPassword, siteName: c.site.nameBn, error: req.query.expired ? 'সেশনের মেয়াদ শেষ হয়েছে, আবার লগইন করুন।' : '' }));
  }));

  router.post('/login', wrap(async (req, res) => {
    const c = await contentSvc.get();
    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase().slice(0, 60) : '';
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    const fail = async (status, error, locked) => {
      const token = randomToken();
      res.cookie(LOGIN_CSRF, sign(token, secret), { ...cookieBase, maxAge: 2 * 3600 * 1000 });
      send(res, V.loginPage({ csrf: token, error, username, devWarning: config.usingDefaultPassword, siteName: c.site.nameBn, locked }), status);
    };
    const cookieToken = unsign(req.cookies[LOGIN_CSRF], secret);
    if (!sameOrigin(req) || !safeEqual(cookieToken, body._csrf)) return fail(403, 'নিরাপত্তা টোকেন মেলেনি। পাতাটি আবার লোড করে চেষ্টা করুন।');

    const ip = req.ip || 'unknown';
    const ukey = 'u:' + username;
    if (ipFailures.blocked(ip) || userFailures.blocked(ukey)) {
      const mins = Math.ceil(Math.max(ipFailures.retryAfterSec(ip), userFailures.retryAfterSec(ukey)) / 60);
      res.set('Retry-After', String(mins * 60));
      return fail(429, `বারবার ভুল চেষ্টার কারণে লগইন সাময়িকভাবে বন্ধ। প্রায় ${mins} মিনিট পরে আবার চেষ্টা করুন।`, false);
    }

    const user = username ? await store.findUserByName(username) : null;
    let ok = false;
    if (user) ok = await verifyPassword(password, user.passwordHash);
    else await burnPasswordCheck(password);
    if (!ok) {
      ipFailures.hit(ip); userFailures.hit(ukey);
      await contentSvc.audit({ ip, user: null }, 'ব্যর্থ লগইন', username || '(ফাঁকা)');
      return fail(401, 'ব্যবহারকারীর নাম বা পাসওয়ার্ড সঠিক নয়।');
    }
    userFailures.reset(ukey);

    const session = { id: randomToken(32), userId: user.id, csrf: randomToken(32), createdAt: Date.now(), expiresAt: Date.now() + config.sessionTtlMs, ip };
    await store.createSession(session);
    await store.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
    res.clearCookie(LOGIN_CSRF, cookieBase);
    res.cookie(SID, sign(session.id, secret), { ...cookieBase, maxAge: config.sessionTtlMs });
    req.user = user;
    await contentSvc.audit(req, 'লগইন', user.username);
    res.redirect(303, '/admin');
  }));

  // ---- everything below requires a logged-in user -------------------------------
  router.use((req, res, next) => {
    if (req.user) return next();
    if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(303, '/admin/login');
    return res.status(401).type('text/plain; charset=utf-8').send('লগইন প্রয়োজন।');
  });

  // Parse multipart bodies (only for authenticated users), then enforce CSRF on every state-changing request.
  router.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const mw = req.path === '/backup/import' ? importUpload.single('backup') : upload.any();
    mw(req, res, (err) => {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'ফাইলের আকার সর্বোচ্চ সীমা (৫ MB) অতিক্রম করেছে।' : 'আপলোড প্রক্রিয়া করা যায়নি।';
        if (!sameOrigin(req)) return res.status(403).send('Forbidden');
        return back(res, safeBack(req), 'error', msg);
      }
      next();
    });
  });
  router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const token = (req.body && req.body._csrf) || req.get('x-csrf-token');
    if (!sameOrigin(req) || !safeEqual(String(token || ''), req.session.csrf)) {
      return res.status(403).type('text/plain; charset=utf-8').send('নিরাপত্তা যাচাই (CSRF) ব্যর্থ হয়েছে। পাতাটি আবার লোড করে চেষ্টা করুন।');
    }
    next();
  });

  function safeBack(req) {
    const ref = req.get('referer');
    try { const u = new URL(ref); if (u.host === req.get('host') && u.pathname.startsWith('/admin')) return u.pathname + u.search; } catch { /* ignore */ }
    return '/admin';
  }

  router.post('/logout', wrap(async (req, res) => {
    await store.deleteSession(req.session.id);
    await contentSvc.audit(req, 'লগআউট', req.user.username);
    res.clearCookie(SID, cookieBase);
    res.redirect(303, '/admin/login');
  }));

  // ---- dashboard -------------------------------------------------------------------
  router.get('/', wrap(async (req, res) => {
    const c = await contentSvc.get();
    const [enq, media, users, audit] = await Promise.all([store.listEnquiries(), store.listMedia(), store.listUsers(), store.listAudit(8)]);
    const stats = {
      unread: enq.filter((e) => !e.read).length, enquiries: enq.length,
      notices: c.notices.items.length, noticesPublished: c.notices.items.filter((n) => n.published).length,
      services: c.services.items.length, leaders: c.leadership.leaders.length, courses: c.training.courses.length,
      gallery: c.gallery.items.length, media: media.length, users: users.length, storage: store.kind,
    };
    send(res, V.dashboard(await ctx(req, res), { content: c, stats, audit }));
  }));

  // ---- sections & nav ------------------------------------------------------------
  router.get('/sections', wrap(async (req, res) => send(res, V.sectionsPage(await ctx(req, res), await contentSvc.get()))));
  router.post('/sections', wrap(async (req, res) => {
    const b = req.body;
    const rows = SECTION_KEYS.map((key, i) => ({
      key, order: Math.min(99, Math.max(1, parseInt(b[`order_${key}`], 10) || i + 1)), idx: i,
      navLabel: typeof b[`label_${key}`] === 'string' ? b[`label_${key}`] : '',
      visible: b[`visible_${key}`] === 'on', inNav: b[`nav_${key}`] === 'on',
    })).sort((a, z) => a.order - z.order || a.idx - z.idx);
    const { value, errors } = validateSections(rows);
    if (errors.length) return back(res, '/admin/sections', 'error', 'সংরক্ষণ করা যায়নি:', errors);
    await contentSvc.update((c) => { c.sections = value; });
    await contentSvc.audit(req, 'হালনাগাদ', 'অংশ ও মেনুর ক্রম');
    back(res, '/admin/sections', 'ok', 'অংশের ক্রম ও মেনু সংরক্ষিত হয়েছে।');
  }));

  // ---- enquiries ---------------------------------------------------------------
  router.get('/enquiries', wrap(async (req, res) => send(res, V.enquiriesPage(await ctx(req, res), await store.listEnquiries()))));
  router.post('/enquiries/:id/read', wrap(async (req, res) => {
    if (!isMediaId(req.params.id)) return back(res, '/admin/enquiries', 'error', 'অবৈধ আইডি।');
    const read = req.body.read === '1';
    await store.updateEnquiry(req.params.id, { read });
    await contentSvc.audit(req, read ? 'পঠিত চিহ্নিত' : 'অপঠিত চিহ্নিত', `বার্তা ${req.params.id}`);
    back(res, '/admin/enquiries', 'ok', read ? 'বার্তাটি পঠিত হিসেবে চিহ্নিত হয়েছে।' : 'বার্তাটি অপঠিত হিসেবে চিহ্নিত হয়েছে।');
  }));
  router.post('/enquiries/:id/delete', wrap(async (req, res) => {
    if (!isMediaId(req.params.id)) return back(res, '/admin/enquiries', 'error', 'অবৈধ আইডি।');
    const ok = await store.deleteEnquiry(req.params.id);
    if (ok) await contentSvc.audit(req, 'মুছে ফেলা', `বার্তা ${req.params.id}`);
    back(res, '/admin/enquiries', ok ? 'ok' : 'error', ok ? 'বার্তাটি মুছে ফেলা হয়েছে।' : 'বার্তাটি পাওয়া যায়নি।');
  }));

  // ---- users -------------------------------------------------------------------
  router.get('/users', wrap(async (req, res) => send(res, V.usersPage(await ctx(req, res), await store.listUsers()))));
  router.post('/users', wrap(async (req, res) => {
    if (req.user.role !== 'owner') return back(res, '/admin/users', 'error', 'শুধু মালিক নতুন ব্যবহারকারী তৈরি করতে পারেন।');
    const username = String(req.body.username || '').trim().toLowerCase();
    const displayName = String(req.body.displayName || '').trim().slice(0, 80);
    const password = String(req.body.password || '');
    const errors = [];
    if (!USERNAME_RE.test(username)) errors.push('ব্যবহারকারীর নাম ৩–৪০ অক্ষরের হতে হবে (a-z, 0-9, . _ -)।');
    if (password.length < 10 || password.length > 200) errors.push('পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।');
    if (!errors.length && (await store.findUserByName(username))) errors.push('এই নামে ইতিমধ্যে একজন ব্যবহারকারী আছেন।');
    if (errors.length) return back(res, '/admin/users', 'error', 'ব্যবহারকারী তৈরি করা যায়নি:', errors);
    await store.addUser({ id: crypto.randomBytes(12).toString('hex'), username, displayName, role: 'admin', passwordHash: await hashPassword(password), createdAt: new Date().toISOString() });
    await contentSvc.audit(req, 'ব্যবহারকারী তৈরি', username);
    back(res, '/admin/users', 'ok', `ব্যবহারকারী “${username}” তৈরি হয়েছে।`);
  }));
  router.post('/users/password', wrap(async (req, res) => {
    const { current = '', next = '', confirm = '' } = req.body;
    const errors = [];
    if (!(await verifyPassword(String(current), req.user.passwordHash))) errors.push('বর্তমান পাসওয়ার্ড সঠিক নয়।');
    if (String(next).length < 10 || String(next).length > 200) errors.push('নতুন পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।');
    if (next !== confirm) errors.push('নতুন পাসওয়ার্ড দুটি মেলেনি।');
    if (errors.length) return back(res, '/admin/users', 'error', 'পাসওয়ার্ড পরিবর্তন হয়নি:', errors);
    await store.updateUser(req.user.id, { passwordHash: await hashPassword(String(next)) });
    await store.deleteUserSessions(req.user.id, req.session.id);
    await contentSvc.audit(req, 'পাসওয়ার্ড পরিবর্তন', req.user.username);
    back(res, '/admin/users', 'ok', 'পাসওয়ার্ড পরিবর্তিত হয়েছে। অন্যান্য ডিভাইসের লগইন বাতিল করা হয়েছে।');
  }));
  router.post('/users/:id/delete', wrap(async (req, res) => {
    if (req.user.role !== 'owner') return back(res, '/admin/users', 'error', 'শুধু মালিক ব্যবহারকারী মুছতে পারেন।');
    const u = isMediaId(req.params.id) ? await store.getUser(req.params.id) : null;
    if (!u) return back(res, '/admin/users', 'error', 'ব্যবহারকারী পাওয়া যায়নি।');
    if (u.id === req.user.id || u.role === 'owner') return back(res, '/admin/users', 'error', 'নিজেকে বা মালিককে মুছে ফেলা যাবে না।');
    await store.deleteUser(u.id);
    await contentSvc.audit(req, 'ব্যবহারকারী মুছে ফেলা', u.username);
    back(res, '/admin/users', 'ok', `ব্যবহারকারী “${u.username}” মুছে ফেলা হয়েছে।`);
  }));

  // ---- media library -----------------------------------------------------------
  router.get('/media', wrap(async (req, res) => {
    const c = await contentSvc.get();
    const refs = mediaRefs(c);
    send(res, V.mediaPage(await ctx(req, res), await store.listMedia(), refs));
  }));
  router.post('/media', wrap(async (req, res) => {
    const files = (req.files || []).filter((f) => f.fieldname === 'files');
    if (!files.length) return back(res, '/admin/media', 'error', 'কোনো ফাইল বাছাই করা হয়নি।');
    const errors = []; let n = 0;
    for (const f of files) {
      const r = prepareUpload(f, { allow: ALL_TYPES, maxBytes: config.maxUploadBytes, user: req.user.username });
      if (r.error) { errors.push(`${decodeName(f)}: ${r.error}`); continue; }
      await store.putMedia(r.meta, r.buffer); n++;
      await contentSvc.audit(req, 'ফাইল আপলোড', r.meta.filename);
    }
    if (errors.length) return back(res, '/admin/media', 'error', `${n}টি ফাইল আপলোড হয়েছে; কিছু ফাইল গ্রহণ করা যায়নি:`, errors);
    back(res, '/admin/media', 'ok', `${n}টি ফাইল আপলোড হয়েছে।`);
  }));
  router.post('/media/:id/delete', wrap(async (req, res) => {
    const id = req.params.id;
    if (!isMediaId(id)) return back(res, '/admin/media', 'error', 'অবৈধ আইডি।');
    const used = mediaRefs(await contentSvc.get()).get(id);
    if (used) return back(res, '/admin/media', 'error', 'ফাইলটি সাইটে ব্যবহৃত হচ্ছে, তাই মোছা যাবে না:', used);
    const meta = await store.getMediaMeta(id);
    const ok = await store.deleteMedia(id);
    if (ok) await contentSvc.audit(req, 'ফাইল মুছে ফেলা', meta ? meta.filename : id);
    back(res, '/admin/media', ok ? 'ok' : 'error', ok ? 'ফাইলটি মুছে ফেলা হয়েছে।' : 'ফাইলটি পাওয়া যায়নি।');
  }));

  // ---- audit -------------------------------------------------------------------
  router.get('/audit', wrap(async (req, res) => send(res, V.auditPage(await ctx(req, res), await store.listAudit(500)))));

  // ---- backup / restore --------------------------------------------------------
  router.get('/backup', wrap(async (req, res) => send(res, V.backupPage(await ctx(req, res)))));
  router.post('/backup/export', wrap(async (req, res) => {
    const content = await contentSvc.get();
    const out = { format: 'prantik-shakti-backup', version: 1, exportedAt: new Date().toISOString(), content };
    if (req.body.media === 'on') {
      out.media = [];
      for (const m of await store.listMedia()) {
        const full = await store.getMedia(m.id);
        if (full) out.media.push({ ...full.meta, data: full.data.toString('base64') });
      }
    }
    if (req.body.enquiries === 'on') out.enquiries = await store.listEnquiries();
    await contentSvc.audit(req, 'ব্যাকআপ ডাউনলোড', out.media ? 'মিডিয়াসহ' : 'শুধু বিষয়বস্তু');
    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="prantik-shakti-backup-${stamp}.json"`);
    res.type('application/json').send(JSON.stringify(out, null, 1));
  }));
  router.post('/backup/import', wrap(async (req, res) => {
    if (!req.file) return back(res, '/admin/backup', 'error', 'ব্যাকআপ ফাইল বাছাই করা হয়নি।');
    let data;
    try { data = JSON.parse(req.file.buffer.toString('utf8')); } catch { return back(res, '/admin/backup', 'error', 'ফাইলটি সঠিক JSON নয়।'); }
    const raw = data && data.format === 'prantik-shakti-backup' ? data.content : null;
    if (!raw) return back(res, '/admin/backup', 'error', 'এটি প্রান্তিক শক্তি ওয়েবসাইটের ব্যাকআপ ফাইল নয়।');
    const { value, errors } = validateContent(raw);
    if (errors.length) return back(res, '/admin/backup', 'error', 'ব্যাকআপের বিষয়বস্তু যাচাইয়ে ত্রুটি পাওয়া গেছে; কিছুই পরিবর্তন করা হয়নি:', errors.slice(0, 20));
    // validate media first, then write
    const mediaIn = Array.isArray(data.media) ? data.media : [];
    const toPut = []; const mErrors = [];
    for (const m of mediaIn) {
      if (!m || !isMediaId(m.id) || typeof m.data !== 'string') { mErrors.push('অবৈধ মিডিয়া এন্ট্রি বাদ দেওয়া হয়েছে।'); continue; }
      const buf = Buffer.from(m.data, 'base64');
      const type = sniffType(buf);
      if (!type || !ALL_TYPES.includes(type) || buf.length > config.maxUploadBytes) { mErrors.push(`${String(m.filename || m.id).slice(0, 80)}: অগ্রহণযোগ্য ফাইল বাদ দেওয়া হয়েছে।`); continue; }
      toPut.push({ meta: { id: m.id, filename: String(m.filename || m.id).slice(0, 120), contentType: type, size: buf.length, createdAt: typeof m.createdAt === 'string' ? m.createdAt.slice(0, 40) : new Date().toISOString(), uploadedBy: String(m.uploadedBy || '').slice(0, 60) }, buf });
    }
    let added = 0;
    for (const m of toPut) { if (!(await store.getMediaMeta(m.meta.id))) { await store.putMedia(m.meta, m.buf); added++; } }
    await contentSvc.update((c) => { for (const k of Object.keys(c)) delete c[k]; Object.assign(c, value); });
    await contentSvc.audit(req, 'ব্যাকআপ রিস্টোর', `${decodeName(req.file) || 'backup.json'} (${added}টি নতুন ফাইল)`);
    back(res, '/admin/backup', mErrors.length ? 'error' : 'ok', `ব্যাকআপ রিস্টোর সম্পন্ন হয়েছে। ${added}টি ফাইল যুক্ত হয়েছে।`, mErrors);
  }));

  // ---- gallery bulk upload -----------------------------------------------------
  router.post('/gallery/bulk', wrap(async (req, res) => {
    const files = (req.files || []).filter((f) => f.fieldname === 'files');
    if (!files.length) return back(res, '/admin/gallery', 'error', 'কোনো ছবি বাছাই করা হয়নি।');
    const errors = []; const ready = [];
    for (const f of files) {
      const r = prepareUpload(f, { allow: IMAGE_TYPES, maxBytes: config.maxUploadBytes, user: req.user.username });
      if (r.error) errors.push(`${decodeName(f)}: ${r.error}`); else ready.push(r);
    }
    const max = SCHEMA.gallery.collections.items.maxItems;
    const result = await contentSvc.update(async (c) => {
      if (c.gallery.items.length + ready.length > max) return { abort: true, error: `গ্যালারিতে সর্বোচ্চ ${max}টি ছবি রাখা যাবে।` };
      for (const r of ready) {
        await store.putMedia(r.meta, r.buffer);
        c.gallery.items.push({ id: newId(), image: r.meta.id, caption: '' });
      }
      return {};
    });
    if (result.abort) return back(res, '/admin/gallery', 'error', result.error);
    if (ready.length) await contentSvc.audit(req, 'গ্যালারিতে ছবি যোগ', `${ready.length}টি ছবি`);
    back(res, '/admin/gallery', errors.length ? 'error' : 'ok', `${ready.length}টি ছবি গ্যালারিতে যোগ হয়েছে।${errors.length ? ' কিছু ফাইল গ্রহণ করা যায়নি:' : ''}`, errors);
  }));

  // ---- generic content editing ---------------------------------------------------
  function resolvePage(req) {
    const page = V.PAGE_BY_SLUG[req.params.page];
    if (!page) return null;
    if (req.params.node && !page.nodes.includes(req.params.node)) return null;
    const node = req.params.node ? SCHEMA[req.params.node] : null;
    if (req.params.coll && !(node.collections && node.collections[req.params.coll])) return null;
    return { page, node, coll: req.params.coll ? node.collections[req.params.coll] : null };
  }
  const notFound = async (req, res) => send(res, V.errorPage(await ctx(req, res), 'পাওয়া যায়নি', 'অনুরোধকৃত পাতা বা আইটেম পাওয়া যায়নি।'), 404);

  // Validates submitted fields; uploads are checked but only stored after everything validates.
  function collectFields(fields, req, existing) {
    const values = {}; const errors = []; const pending = [];
    const files = req.files || [];
    const body = req.body || {};
    for (const f of fields) {
      if (f.type === 'meta') { values[f.name] = existing[f.name] || ''; continue; }
      if (f.type === 'image' || f.type === 'attachment') {
        const file = files.find((x) => x.fieldname === `file_${f.name}`);
        let v = existing[f.name] || '';
        if (body[`remove_${f.name}`] === 'on') v = '';
        if (file) {
          const r = prepareUpload(file, { allow: f.type === 'image' ? IMAGE_TYPES : ALL_TYPES, maxBytes: config.maxUploadBytes, user: req.user.username });
          if (r.error) errors.push(`${f.label}: ${r.error}`); else { pending.push(r); v = r.meta.id; }
        }
        if (f.required && !v) errors.push(`${f.label}: একটি ফাইল আবশ্যক।`);
        values[f.name] = v;
        continue;
      }
      if (f.type === 'images') {
        const removeRaw = body[`remove_${f.name}`];
        const remove = new Set(Array.isArray(removeRaw) ? removeRaw : removeRaw ? [removeRaw] : []);
        const list = (existing[f.name] || []).filter((id) => !remove.has(id));
        for (const file of files.filter((x) => x.fieldname === `file_${f.name}`)) {
          const r = prepareUpload(file, { allow: IMAGE_TYPES, maxBytes: config.maxUploadBytes, user: req.user.username });
          if (r.error) errors.push(`${f.label} (${decodeName(file)}): ${r.error}`); else { pending.push(r); list.push(r.meta.id); }
        }
        if (list.length > f.maxItems) errors.push(`${f.label}: সর্বোচ্চ ${f.maxItems}টি ছবি রাখা যাবে।`);
        values[f.name] = list;
        continue;
      }
      const { value, error } = validateField(f, body[f.name]);
      values[f.name] = value;
      if (error) errors.push(error);
    }
    return { values, errors, pending };
  }
  async function commitMedia(pending) { for (const p of pending) await store.putMedia(p.meta, p.buffer); }

  router.get('/:page', wrap(async (req, res) => {
    const r = resolvePage(req);
    if (!r) return notFound(req, res);
    send(res, V.nodePage(await ctx(req, res), r.page, await contentSvc.get(), await mediaMap()));
  }));

  router.post('/:page/:node', wrap(async (req, res) => {
    const r = resolvePage(req);
    if (!r) return notFound(req, res);
    const nodeKey = req.params.node;
    const fields = (r.node.fields || []).filter((f) => f.type !== 'meta');
    const current = (await contentSvc.get())[nodeKey];
    const { values, errors, pending } = collectFields(fields, req, current);
    if (errors.length) {
      const c = await contentSvc.get();
      const cx = await ctx(req, res);
      cx.flash = { type: 'error', msg: 'সংরক্ষণ করা যায়নি। ত্রুটিগুলো ঠিক করুন:', list: errors };
      return send(res, V.nodePage(cx, r.page, c, await mediaMap(), { nodeKey, values }), 400);
    }
    await commitMedia(pending);
    await contentSvc.update((c) => { Object.assign(c[nodeKey], values); });
    await contentSvc.audit(req, 'হালনাগাদ', r.node.label);
    back(res, `/admin/${r.page.slug}#n-${nodeKey}`, 'ok', `“${r.node.label}” সংরক্ষিত হয়েছে।`);
  }));

  router.get('/:page/:node/:coll/new', wrap(async (req, res) => {
    const r = resolvePage(req);
    if (!r) return notFound(req, res);
    const blank = {};
    for (const f of r.coll.fields) blank[f.name] = f.type === 'bool' ? true : f.type === 'images' ? [] : '';
    if (blank.date !== undefined && r.coll.fields.some((f) => f.name === 'date')) blank.date = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
    if (r.coll.fields.some((f) => f.type === 'select')) { const sf = r.coll.fields.find((f) => f.type === 'select'); blank[sf.name] = sf.options[0].value; }
    send(res, V.itemPage(await ctx(req, res), r.page, req.params.node, req.params.coll, blank, await mediaMap(), { isNew: true }));
  }));

  router.get('/:page/:node/:coll/:id/edit', wrap(async (req, res) => {
    const r = resolvePage(req);
    if (!r || !isId(req.params.id)) return notFound(req, res);
    const item = (await contentSvc.get())[req.params.node][req.params.coll].find((x) => x.id === req.params.id);
    if (!item) return notFound(req, res);
    send(res, V.itemPage(await ctx(req, res), r.page, req.params.node, req.params.coll, item, await mediaMap(), { isNew: false }));
  }));

  async function saveItem(req, res, isNew) {
    const r = resolvePage(req);
    if (!r || (!isNew && !isId(req.params.id))) return notFound(req, res);
    const { node: nodeKey, coll: collKey } = req.params;
    const c0 = await contentSvc.get();
    const list0 = c0[nodeKey][collKey];
    const existing = isNew ? {} : list0.find((x) => x.id === req.params.id);
    if (!existing) return notFound(req, res);
    const { values, errors, pending } = collectFields(r.coll.fields, req, existing);
    if (isNew && list0.length >= r.coll.maxItems) errors.push(`সর্বোচ্চ ${r.coll.maxItems}টি ${r.coll.itemLabel} রাখা যাবে।`);
    if (errors.length) {
      return send(res, V.itemPage(await ctx(req, res), r.page, nodeKey, collKey, { ...existing, ...values }, await mediaMap(), { isNew, errors }), 400);
    }
    await commitMedia(pending);
    const id = isNew ? newId() : existing.id;
    const result = await contentSvc.update((c) => {
      const list = c[nodeKey][collKey];
      if (isNew) {
        if (r.coll.fields.some((f) => f.name === 'createdAt')) values.createdAt = new Date().toISOString();
        list.push({ id, ...values });
      } else {
        const i = list.findIndex((x) => x.id === id);
        if (i < 0) return { abort: true };
        list[i] = { id, ...values };
      }
      return {};
    });
    if (result.abort) return notFound(req, res);
    const title = values[r.coll.titleField] || r.coll.itemLabel;
    await contentSvc.audit(req, isNew ? 'যোগ' : 'হালনাগাদ', `${r.coll.label}: ${title}`);
    back(res, `/admin/${r.page.slug}#c-${nodeKey}-${collKey}`, 'ok', isNew ? `নতুন ${r.coll.itemLabel} “${title}” যোগ হয়েছে।` : `“${title}” সংরক্ষিত হয়েছে।`);
  }
  router.post('/:page/:node/:coll/new', wrap((req, res) => saveItem(req, res, true)));
  router.post('/:page/:node/:coll/:id', wrap((req, res) => saveItem(req, res, false)));

  async function itemAction(req, res, fn, okMsg) {
    const r = resolvePage(req);
    if (!r || !isId(req.params.id)) return notFound(req, res);
    const { node: nodeKey, coll: collKey, id } = req.params;
    let title = '';
    const result = await contentSvc.update((c) => {
      const list = c[nodeKey][collKey];
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return { abort: true };
      title = list[i][r.coll.titleField] || r.coll.itemLabel;
      return fn(list, i, r.coll) || {};
    });
    const dest = `/admin/${r.page.slug}#c-${nodeKey}-${collKey}`;
    if (result.abort) return back(res, dest, 'error', result.error || 'আইটেমটি পাওয়া যায়নি।');
    await contentSvc.audit(req, result.action, `${r.coll.label}: ${title}`);
    back(res, dest, 'ok', okMsg(title, result));
  }

  router.post('/:page/:node/:coll/:id/delete', wrap((req, res) => itemAction(req, res, (list, i) => { list.splice(i, 1); return { action: 'মুছে ফেলা' }; }, (t) => `“${t}” মুছে ফেলা হয়েছে।`)));

  router.post('/:page/:node/:coll/:id/move', wrap((req, res) => itemAction(req, res, (list, i, coll) => {
    if (!coll.orderable) return { abort: true, error: 'এই তালিকার ক্রম পরিবর্তন করা যায় না।' };
    const j = req.body.dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return { abort: true, error: 'আর সরানো যাবে না।' };
    [list[i], list[j]] = [list[j], list[i]];
    return { action: 'ক্রম পরিবর্তন' };
  }, (t) => `“${t}”-এর ক্রম পরিবর্তিত হয়েছে।`)));

  router.post('/:page/:node/:coll/:id/toggle', wrap((req, res) => itemAction(req, res, (list, i) => {
    const item = list[i];
    const key = 'published' in item ? 'published' : 'visible' in item ? 'visible' : null;
    if (!key) return { abort: true, error: 'এই আইটেম লুকানো/প্রকাশ করা যায় না।' };
    item[key] = !item[key];
    return { action: item[key] ? 'প্রকাশ' : 'লুকানো', on: item[key] };
  }, (t, r) => (r.on ? `“${t}” প্রকাশিত হয়েছে।` : `“${t}” লুকানো হয়েছে।`))));

  return router;
};

module.exports.SECTION_NAMES = SECTION_NAMES;
