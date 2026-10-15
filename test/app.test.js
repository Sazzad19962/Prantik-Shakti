'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const { loadConfig } = require('../src/config');
const { JsonStore } = require('../src/store/json-store');
const { createApp, bootstrap } = require('../src/app');

const PASSWORD = 'correct-horse-battery';
const quiet = { info() {}, warn() {} };

async function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psl-test-'));
  const { config } = loadConfig({ DATA_DIR: dir, ADMIN_USERNAME: 'owner', ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: 'x'.repeat(48), NODE_ENV: 'test' });
  const store = new JsonStore(dir);
  await store.init();
  const app = createApp({ config, store });
  await bootstrap(store, config, app.locals.contentSvc, quiet);
  return { app, store, dir };
}

const csrfFrom = (html) => {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  assert.ok(m, 'csrf token present');
  return m[1];
};

async function login(app, username = 'owner', password = PASSWORD) {
  const agent = request.agent(app);
  const page = await agent.get('/admin/login').expect(200);
  const res = await agent.post('/admin/login').type('form').send({ _csrf: csrfFrom(page.text), username, password });
  return { agent, res };
}

async function adminCsrf(agent, url = '/admin') {
  const r = await agent.get(url).expect(200);
  return csrfFrom(r.text);
}

// minimal valid image/pdf bytes for upload tests
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 32)]);

describe('Prantik Shakti app', () => {
  let ctx;
  before(async () => { ctx = await makeApp(); });
  after(() => fs.rmSync(ctx.dir, { recursive: true, force: true }));

  test('public home renders seeded content from the original site', async () => {
    const r = await request(ctx.app).get('/').expect(200);
    assert.match(r.text, /তরুণের দক্ষতায় <span>দেশের শক্তি<\/span>/);
    assert.match(r.text, /মেজর জেনারেল আব্দুল মোতালেব সাজ্জাদ মাহমুদ/);
    assert.match(r.text, /০১৩৩৫-৩০০৯৫৭/);
    assert.match(r.text, /bawt25@gmail\.com/);
    assert.match(r.text, /TRAD\/DSCC\/037432\/2024/);
    assert.match(r.text, /এখনো কোনো নোটিশ প্রকাশিত হয়নি/);
    assert.doesNotMatch(r.text, /id="gallery"/, 'empty gallery is hidden');
    assert.match(r.headers['content-security-policy'], /default-src 'self'/);
    assert.equal(r.headers['x-frame-options'], 'DENY');
  });

  test('unauthenticated users are blocked from admin', async () => {
    const r = await request(ctx.app).get('/admin').expect(303);
    assert.equal(r.headers.location, '/admin/login');
    await request(ctx.app).get('/admin/services').expect(303);
    await request(ctx.app).post('/admin/hero/hero').type('form').send({ headingMain: 'hacked' }).expect(401);
    const home = await request(ctx.app).get('/');
    assert.doesNotMatch(home.text, /hacked/);
  });

  test('login fails with wrong password and succeeds with the right one', async () => {
    const bad = await login(ctx.app, 'owner', 'wrong-password');
    assert.equal(bad.res.status, 401);
    assert.match(bad.res.text, /ব্যবহারকারীর নাম বা পাসওয়ার্ড সঠিক নয়/);
    assert.equal(bad.res.headers['set-cookie'].some((c) => c.startsWith('psl_sid=')), false);

    const good = await login(ctx.app);
    assert.equal(good.res.status, 303);
    assert.equal(good.res.headers.location, '/admin');
    const cookie = good.res.headers['set-cookie'].find((c) => c.startsWith('psl_sid='));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const dash = await good.agent.get('/admin').expect(200);
    assert.match(dash.text, /ড্যাশবোর্ড/);
  });

  test('login without the login CSRF token is rejected', async () => {
    const r = await request(ctx.app).post('/admin/login').type('form').send({ username: 'owner', password: PASSWORD });
    assert.equal(r.status, 403);
  });

  test('repeated login failures lock the account temporarily', async () => {
    const { app } = await makeApp();
    for (let i = 0; i < 5; i++) assert.equal((await login(app, 'owner', 'nope-' + i)).res.status, 401);
    const locked = await login(app, 'owner', PASSWORD);
    assert.equal(locked.res.status, 429);
  });

  test('state-changing admin requests without a valid CSRF token are rejected', async () => {
    const { agent } = await login(ctx.app);
    await agent.post('/admin/hero/hero').type('form').send({ headingMain: 'নতুন' }).expect(403);
    await agent.post('/admin/hero/hero').type('form').send({ headingMain: 'নতুন', _csrf: 'forged' }).expect(403);
    const token = await adminCsrf(agent);
    // valid token but cross-site Origin header
    await agent.post('/admin/hero/hero').set('Origin', 'https://evil.example').type('form').send({ headingMain: 'নতুন', _csrf: token }).expect(403);
    const home = await request(ctx.app).get('/');
    assert.match(home.text, /তরুণের দক্ষতায়/);
  });

  test('content update is reflected on the public page immediately and audited', async () => {
    const { agent } = await login(ctx.app);
    const token = await adminCsrf(agent, '/admin/hero');
    const r = await agent.post('/admin/hero/hero').type('form').send({
      _csrf: token, eyebrow: 'নতুন উপশিরোনাম', headingMain: 'দক্ষ তরুণ', headingAccent: 'সমৃদ্ধ দেশ', lead: 'নতুন ভূমিকা',
      cta1Label: 'সেবা', cta1Href: '#services', cta2Label: 'যোগাযোগ', cta2Href: '#contact', pillarsLabel: 'স্তম্ভ',
    });
    assert.equal(r.status, 303);
    const home = await request(ctx.app).get('/').expect(200);
    assert.match(home.text, /দক্ষ তরুণ <span>সমৃদ্ধ দেশ<\/span>/);
    assert.match(home.text, /নতুন উপশিরোনাম/);
    const audit = await agent.get('/admin/audit').expect(200);
    assert.match(audit.text, /হিরো অংশ/);
  });

  test('server-side validation rejects bad input with a Bangla error', async () => {
    const { agent } = await login(ctx.app);
    const token = await adminCsrf(agent, '/admin/hero');
    const r = await agent.post('/admin/hero/hero').type('form').send({ _csrf: token, headingMain: '', cta1Href: 'javascript:alert(1)' });
    assert.equal(r.status, 400);
    assert.match(r.text, /পূরণ করা আবশ্যক/);
    assert.match(r.text, /লিংক অবশ্যই/);
  });

  test('admin-entered <script> payloads are HTML-escaped on the public site', async () => {
    const { agent } = await login(ctx.app);
    const token = await adminCsrf(agent, '/admin/services');
    const payload = '<script>alert("x")</script><img src=x onerror=alert(1)>';
    await agent.post('/admin/services/services/items/new').type('form')
      .send({ _csrf: token, title: payload, icon: 'globe', description: payload, tag: '"><b>', visible: 'on' }).expect(303);
    const home = await request(ctx.app).get('/').expect(200);
    assert.doesNotMatch(home.text, /<script>alert/);
    assert.doesNotMatch(home.text, /<img src=x/);
    assert.match(home.text, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.match(home.text, /&quot;&gt;&lt;b&gt;/);
    const adminPage = await agent.get('/admin/services').expect(200);
    assert.doesNotMatch(adminPage.text, /<script>alert/);
  });

  test('notice CRUD: create, publish/unpublish, detail page, edit, delete', async () => {
    const { agent } = await login(ctx.app);
    let token = await adminCsrf(agent, '/admin/notices');
    await agent.post('/admin/notices/notices/items/new').type('form')
      .send({ _csrf: token, title: 'প্রশিক্ষণ ভর্তি বিজ্ঞপ্তি', date: '2026-10-01', body: 'ভর্তি চলছে।', published: 'on' }).expect(303);
    await agent.post('/admin/notices/notices/items/new').type('form')
      .send({ _csrf: token, title: 'নতুনতম নোটিশ', date: '2026-10-10', body: 'বিস্তারিত', published: 'on' }).expect(303);
    await agent.post('/admin/notices/notices/items/new').type('form')
      .send({ _csrf: token, title: 'খসড়া নোটিশ', date: '2026-10-12', body: 'গোপন' }).expect(303);

    let home = await request(ctx.app).get('/').expect(200);
    assert.match(home.text, /প্রশিক্ষণ ভর্তি বিজ্ঞপ্তি/);
    assert.doesNotMatch(home.text, /খসড়া নোটিশ/);
    assert.doesNotMatch(home.text, /এখনো কোনো নোটিশ প্রকাশিত হয়নি/);
    assert.ok(home.text.indexOf('নতুনতম নোটিশ') < home.text.indexOf('প্রশিক্ষণ ভর্তি বিজ্ঞপ্তি'), 'newest first');

    const content = await ctx.store.getContent();
    const notice = content.notices.items.find((n) => n.title === 'প্রশিক্ষণ ভর্তি বিজ্ঞপ্তি');
    const draft = content.notices.items.find((n) => n.title === 'খসড়া নোটিশ');
    const detail = await request(ctx.app).get(`/notices/${notice.id}`).expect(200);
    assert.match(detail.text, /ভর্তি চলছে।/);
    assert.match(detail.text, /১ অক্টোবর ২০২৬/);
    await request(ctx.app).get(`/notices/${draft.id}`).expect(404);
    await request(ctx.app).get('/notices/<bad>').expect(404);

    token = await adminCsrf(agent, '/admin/notices');
    await agent.post(`/admin/notices/notices/items/${notice.id}`).type('form')
      .send({ _csrf: token, title: 'সংশোধিত নোটিশ', date: '2026-10-01', body: 'হালনাগাদ', published: 'on' }).expect(303);
    await agent.post(`/admin/notices/notices/items/${draft.id}/toggle`).type('form').send({ _csrf: token }).expect(303);
    home = await request(ctx.app).get('/');
    assert.match(home.text, /সংশোধিত নোটিশ/);
    assert.match(home.text, /খসড়া নোটিশ/);

    for (const n of (await ctx.store.getContent()).notices.items) {
      await agent.post(`/admin/notices/notices/items/${n.id}/delete`).type('form').send({ _csrf: token }).expect(303);
    }
    home = await request(ctx.app).get('/');
    assert.match(home.text, /এখনো কোনো নোটিশ প্রকাশিত হয়নি/);
  });

  test('notice with a PDF attachment is served from /media with the right type', async () => {
    const { agent } = await login(ctx.app);
    const token = await adminCsrf(agent, '/admin/notices');
    await agent.post('/admin/notices/notices/items/new')
      .field('_csrf', token).field('title', 'সংযুক্তিসহ নোটিশ').field('date', '2026-10-05').field('published', 'on')
      .attach('file_attachment', PDF, { filename: 'notice.pdf', contentType: 'application/pdf' }).expect(303);
    const n = (await ctx.store.getContent()).notices.items.find((x) => x.title === 'সংযুক্তিসহ নোটিশ');
    assert.match(n.attachment, /^[a-f0-9]{24}$/);
    const m = await request(ctx.app).get(`/media/${n.attachment}`).expect(200);
    assert.equal(m.headers['content-type'], 'application/pdf');
    await request(ctx.app).get('/media/not-an-id').expect(404);
  });

  test('uploads with a disallowed type are rejected', async () => {
    const { agent } = await login(ctx.app);
    const token = await adminCsrf(agent, '/admin/media');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const before = (await ctx.store.listMedia()).length;
    const r = await agent.post('/admin/media').field('_csrf', token)
      .attach('files', svg, { filename: 'evil.svg', contentType: 'image/svg+xml' });
    assert.equal(r.status, 303);
    // HTML disguised as PNG is rejected too (content sniffing)
    await agent.post('/admin/media').field('_csrf', token)
      .attach('files', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'x.png', contentType: 'image/png' }).expect(303);
    assert.equal((await ctx.store.listMedia()).length, before);
    const page = await agent.get('/admin/media').expect(200);
    assert.match(page.text, /শুধু JPG, PNG, WEBP বা PDF/);
    // an image field refuses a PDF
    const t2 = await adminCsrf(agent, '/admin/leadership');
    const leader = (await ctx.store.getContent()).leadership.leaders[0];
    const r2 = await agent.post(`/admin/leadership/leadership/leaders/${leader.id}`)
      .field('_csrf', t2).field('name', leader.name).field('visible', 'on')
      .attach('file_photo', PDF, { filename: 'photo.pdf', contentType: 'application/pdf' });
    assert.equal(r2.status, 400);
    assert.match(r2.text, /শুধু JPG, PNG বা WEBP/);
    // a real PNG is accepted
    await agent.post('/admin/media').field('_csrf', t2).attach('files', PNG, { filename: 'ok.png', contentType: 'image/png' }).expect(303);
    assert.equal((await ctx.store.listMedia()).length, before + 1);
  });

  test('enquiry form: valid submission is stored, honeypot is silently dropped, invalid input re-rendered', async () => {
    const before = (await ctx.store.listEnquiries()).length;
    const ok = await request(ctx.app).post('/enquiry').type('form')
      .send({ name: 'রহিম উদ্দিন', phone: '01711-000000', email: '', subject: 'কোর্সের তথ্য', message: 'কোর্সের ফি জানতে চাই।', website: '' });
    assert.equal(ok.status, 303);
    assert.match(ok.headers.location, /enquiry=sent/);
    const bot = await request(ctx.app).post('/enquiry').type('form')
      .send({ name: 'Bot', phone: '0123456789', subject: 'spam', message: 'buy now buy now', website: 'http://spam.example' });
    assert.equal(bot.status, 303);
    const bad = await request(ctx.app).post('/enquiry').type('form').send({ name: '', phone: 'abc', subject: '', message: '<script>x</script>' });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /সঠিক মোবাইল নম্বর লিখুন/);
    assert.doesNotMatch(bad.text, /<script>x<\/script>/);
    const list = await ctx.store.listEnquiries();
    assert.equal(list.length, before + 1);
    assert.equal(list[0].name, 'রহিম উদ্দিন');

    const { agent } = await login(ctx.app);
    const page = await agent.get('/admin/enquiries').expect(200);
    assert.match(page.text, /কোর্সের তথ্য/);
    const token = csrfFrom(page.text);
    await agent.post(`/admin/enquiries/${list[0].id}/read`).type('form').send({ _csrf: token, read: '1' }).expect(303);
    assert.equal((await ctx.store.listEnquiries())[0].read, true);
    await agent.post(`/admin/enquiries/${list[0].id}/delete`).type('form').send({ _csrf: token }).expect(303);
    assert.equal((await ctx.store.listEnquiries()).length, before);
  });

  test('enquiry form is rate limited per IP', async () => {
    const { app } = await makeApp();
    const send = () => request(app).post('/enquiry').type('form').send({ name: 'করিম', phone: '01711000000', subject: 'প্রশ্ন', message: 'একটি প্রশ্ন আছে।' });
    for (let i = 0; i < 5; i++) assert.equal((await send()).status, 303);
    assert.equal((await send()).status, 429);
  });

  test('section visibility and order are applied to the public page and nav', async () => {
    const { app, store } = await makeApp();
    const { agent } = await login(app);
    const token = await adminCsrf(agent, '/admin/sections');
    const body = { _csrf: token };
    const keys = ['about', 'leadership', 'services', 'training', 'overseas', 'resort', 'structure', 'notice', 'gallery', 'contact'];
    keys.forEach((k, i) => { body[`order_${k}`] = String(k === 'contact' ? 1 : i + 2); body[`label_${k}`] = k; body[`visible_${k}`] = k === 'structure' ? '' : 'on'; if (k === 'about') body[`nav_${k}`] = 'on'; });
    await agent.post('/admin/sections').type('form').send(body).expect(303);
    const home = await request(app).get('/');
    assert.doesNotMatch(home.text, /id="structure"/);
    assert.ok(home.text.indexOf('id="contact"') < home.text.indexOf('id="about"'), 'contact moved first');
    assert.equal((await store.getContent()).sections[0].key, 'contact');
  });

  test('users: owner creates an admin who can log in; password change works', async () => {
    const { app } = await makeApp();
    const { agent } = await login(app);
    let token = await adminCsrf(agent, '/admin/users');
    await agent.post('/admin/users').type('form').send({ _csrf: token, username: 'editor', displayName: 'সম্পাদক', password: 'editor-pass-1' }).expect(303);
    await agent.post('/admin/users').type('form').send({ _csrf: token, username: 'x', password: 'short' }).expect(303);
    const ed = await login(app, 'editor', 'editor-pass-1');
    assert.equal(ed.res.status, 303);
    token = await adminCsrf(ed.agent, '/admin/users');
    await ed.agent.post('/admin/users/password').type('form').send({ _csrf: token, current: 'editor-pass-1', next: 'editor-pass-2', confirm: 'editor-pass-2' }).expect(303);
    assert.equal((await login(app, 'editor', 'editor-pass-1')).res.status, 401);
    assert.equal((await login(app, 'editor', 'editor-pass-2')).res.status, 303);
  });

  test('backup export and import round-trip', async () => {
    const { app, store } = await makeApp();
    const { agent } = await login(app);
    const token = await adminCsrf(agent, '/admin/backup');
    const exp = await agent.post('/admin/backup/export').type('form').send({ _csrf: token, media: 'on' }).expect(200);
    const backup = JSON.parse(exp.text);
    assert.equal(backup.format, 'prantik-shakti-backup');
    backup.content.hero.headingMain = 'রিস্টোর পরীক্ষা';
    await agent.post('/admin/backup/import').field('_csrf', token)
      .attach('backup', Buffer.from(JSON.stringify(backup)), { filename: 'b.json', contentType: 'application/json' }).expect(303);
    assert.equal((await store.getContent()).hero.headingMain, 'রিস্টোর পরীক্ষা');
    // invalid backup leaves content untouched
    backup.content.hero.cta1Href = 'javascript:alert(1)';
    await agent.post('/admin/backup/import').field('_csrf', token)
      .attach('backup', Buffer.from(JSON.stringify(backup)), { filename: 'b.json', contentType: 'application/json' }).expect(303);
    assert.equal((await store.getContent()).hero.cta1Href, '#services');
  });

  test('logout invalidates the session', async () => {
    const { agent } = await login(ctx.app);
    const token = await adminCsrf(agent);
    await agent.post('/admin/logout').type('form').send({ _csrf: token }).expect(303);
    await agent.get('/admin').expect(303);
  });
});
