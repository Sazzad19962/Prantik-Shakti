'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { renderHome, renderNoticePage, renderNotFound } = require('../views/site');
const { isId, isMediaId, cleanText, EMAIL_RE } = require('../schema');
const { RateLimiter } = require('../security');

const PHONE_RE = /^[0-9০-৯+\-\s()]{6,20}$/;

function validateEnquiry(body) {
  const get = (k, max) => cleanText(typeof body[k] === 'string' ? body[k] : '').trim().slice(0, max + 1);
  const v = {
    name: get('name', 100).replace(/\s+/g, ' '),
    phone: get('phone', 20),
    email: get('email', 200),
    subject: get('subject', 150).replace(/\s+/g, ' '),
    message: get('message', 3000),
  };
  const errors = [];
  if (v.name.length < 2) errors.push('আপনার নাম লিখুন।');
  else if (v.name.length > 100) errors.push('নাম সর্বোচ্চ ১০০ অক্ষর হতে পারবে।');
  if (!PHONE_RE.test(v.phone)) errors.push('সঠিক মোবাইল নম্বর লিখুন।');
  if (v.email && (!EMAIL_RE.test(v.email) || v.email.length > 200)) errors.push('সঠিক ই-মেইল ঠিকানা লিখুন অথবা ঘরটি ফাঁকা রাখুন।');
  if (v.subject.length < 2) errors.push('বার্তার বিষয় লিখুন।');
  else if (v.subject.length > 150) errors.push('বিষয় সর্বোচ্চ ১৫০ অক্ষর হতে পারবে।');
  if (v.message.length < 5) errors.push('বার্তাটি লিখুন (কমপক্ষে ৫ অক্ষর)।');
  else if (v.message.length > 3000) errors.push('বার্তা সর্বোচ্চ ৩০০০ অক্ষর হতে পারবে।');
  return { values: v, errors };
}

function publicContent(c) {
  const out = structuredClone(c);
  out.notices.items = out.notices.items.filter((n) => n.published);
  for (const [node, key] of [['leadership', 'leaders'], ['services', 'items'], ['training', 'courses'], ['resorts', 'items']]) {
    out[node][key] = out[node][key].filter((x) => x.visible);
  }
  out.sections = out.sections.filter((s) => s.visible);
  return out;
}

module.exports = function publicRoutes({ store, contentSvc }) {
  const router = express.Router();
  const enquiryLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

  const sendHtml = (res, status, body) => {
    res.status(status).set('Cache-Control', 'no-cache').type('html').send(body);
  };

  router.get('/', async (req, res, next) => {
    try {
      const c = await contentSvc.get();
      sendHtml(res, 200, renderHome(c, { enquirySent: req.query.enquiry === 'sent' }));
    } catch (e) { next(e); }
  });

  router.get('/index.html', (req, res) => res.redirect(301, '/'));

  router.get('/notices/:id', async (req, res, next) => {
    try {
      const c = await contentSvc.get();
      const n = isId(req.params.id) && c.notices.items.find((x) => x.id === req.params.id && x.published);
      if (!n) return sendHtml(res, 404, renderNotFound(c));
      sendHtml(res, 200, renderNoticePage(c, n));
    } catch (e) { next(e); }
  });

  router.get('/api/content', async (req, res, next) => {
    try { res.set('Cache-Control', 'no-cache').json(publicContent(await contentSvc.get())); } catch (e) { next(e); }
  });

  router.post('/enquiry', async (req, res, next) => {
    try {
      const c = await contentSvc.get();
      if (!c.contact.formEnabled) return sendHtml(res, 404, renderNotFound(c));
      const body = req.body || {};
      // Honeypot: real visitors never fill the hidden "website" field. Pretend success, store nothing.
      if (typeof body.website === 'string' && body.website.trim() !== '') return res.redirect(303, '/?enquiry=sent#enquiry');
      const key = req.ip || 'unknown';
      if (!enquiryLimiter.hit(key)) {
        res.set('Retry-After', String(enquiryLimiter.retryAfterSec(key)));
        return sendHtml(res, 429, renderHome(c, { enquiry: { values: {}, errors: ['অল্প সময়ে অনেকবার বার্তা পাঠানো হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।'] } }));
      }
      const { values, errors } = validateEnquiry(body);
      if (errors.length) return sendHtml(res, 400, renderHome(c, { enquiry: { values, errors } }));
      await store.addEnquiry({
        id: crypto.randomBytes(12).toString('hex'),
        ...values, read: false, createdAt: new Date().toISOString(),
        ip: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 200),
      });
      res.redirect(303, '/?enquiry=sent#enquiry');
    } catch (e) { next(e); }
  });

  router.get('/media/:id', async (req, res, next) => {
    try {
      if (!isMediaId(req.params.id)) return res.status(404).end();
      const m = await store.getMedia(req.params.id);
      if (!m) return res.status(404).type('text/plain; charset=utf-8').send('ফাইল পাওয়া যায়নি।');
      res.set({
        'Content-Type': m.meta.contentType,
        'Content-Length': String(m.data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(m.meta.filename)}`,
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      res.end(m.data);
    } catch (e) { next(e); }
  });

  router.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).end();
    try { sendHtml(res, 404, renderNotFound(await contentSvc.get())); } catch (e) { next(e); }
  });

  return router;
};

module.exports.validateEnquiry = validateEnquiry;
