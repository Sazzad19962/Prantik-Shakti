'use strict';

// Admin panel views (Bangla UI). All dynamic values escaped via html``.

const { html, raw, nl2br, bnDigits, bnDate, bnDateTime, bnSize } = require('../util/html');
const { SCHEMA, SECTION_NAMES } = require('../schema');
const { iconSvg } = require('./icons');

const ADMIN_PAGES = [
  { slug: 'settings', title: 'সাইট সেটিংস', nodes: ['site', 'contact', 'footer'], desc: 'সাধারণ তথ্য, লোগো, যোগাযোগ, ফুটার ও নিবন্ধন তথ্য।' },
  { slug: 'hero', title: 'হিরো ও স্তম্ভ', nodes: ['hero'], desc: 'প্রথম পাতার শীর্ষ অংশ ও চারটি মূল স্তম্ভ।' },
  { slug: 'about', title: 'পরিচিতি ও তথ্য-রেখা', nodes: ['about', 'facts'], desc: '“আমাদের সম্পর্কে” অংশ ও হিরোর নিচের তথ্য-রেখা।' },
  { slug: 'leadership', title: 'নেতৃত্ব', nodes: ['leadership'], desc: 'পরিচালনা পর্ষদ ও ব্যবস্থাপনার কার্ড।' },
  { slug: 'services', title: 'সেবাসমূহ', nodes: ['services'], desc: 'সেবার কার্ড, আইকন, ট্যাগ ও ক্রম।' },
  { slug: 'training', title: 'প্রশিক্ষণ ও কোর্স', nodes: ['training'], desc: 'PSTC পরিচিতি, প্রশিক্ষণের ধরন ও কোর্স তালিকা।' },
  { slug: 'overseas', title: 'বৈদেশিক কর্মসংস্থান', nodes: ['overseas'], desc: 'বিজ্ঞপ্তি ও প্রক্রিয়ার ধাপসমূহ।' },
  { slug: 'resorts', title: 'অবকাশ কেন্দ্র', nodes: ['resorts'], desc: 'রিসোর্টের বিবরণ, ছবি ও বুকিং তথ্য।' },
  { slug: 'structure', title: 'সাংগঠনিক কাঠামো', nodes: ['structure'], desc: 'কার্যমডিউল ও দায়িত্বপ্রাপ্ত কর্মকর্তা।' },
  { slug: 'notices', title: 'নোটিশ', nodes: ['notices'], desc: 'নোটিশ প্রকাশ, সংযুক্তি ও খসড়া।' },
  { slug: 'gallery', title: 'গ্যালারি', nodes: ['gallery'], desc: 'ছবি ও ক্যাপশন। ফাঁকা থাকলে অংশটি লুকানো থাকে।' },
];
const PAGE_BY_SLUG = Object.fromEntries(ADMIN_PAGES.map((p) => [p.slug, p]));

const NAV = [
  { href: '/admin', label: 'ড্যাশবোর্ড', key: 'dashboard' },
  ...ADMIN_PAGES.map((p) => ({ href: `/admin/${p.slug}`, label: p.title, key: p.slug })),
  { href: '/admin/sections', label: 'অংশ ও মেনুর ক্রম', key: 'sections' },
  { href: '/admin/enquiries', label: 'বার্তা (এনকোয়ারি)', key: 'enquiries' },
  { href: '/admin/media', label: 'মিডিয়া লাইব্রেরি', key: 'media' },
  { href: '/admin/users', label: 'ব্যবহারকারী', key: 'users' },
  { href: '/admin/audit', label: 'কার্যক্রমের লগ', key: 'audit' },
  { href: '/admin/backup', label: 'ব্যাকআপ ও রিস্টোর', key: 'backup' },
];

const csrfInput = (t) => html`<input type="hidden" name="_csrf" value="${t}">`;

function head(title) {
  return html`<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} | অ্যাডমিন প্যানেল</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600&family=Noto+Serif+Bengali:wght@600;700;800&display=swap">
<link rel="stylesheet" href="/css/site.css">
<link rel="stylesheet" href="/css/admin.css">
</head>`;
}

function flashBox(flash) {
  if (!flash) return '';
  return html`<div class="flash ${flash.type === 'error' ? 'error' : 'ok'}" role="${flash.type === 'error' ? 'alert' : 'status'}">
    ${flash.msg}
    ${flash.list && flash.list.length ? html`<ul>${flash.list.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
  </div>`;
}

function layout(ctx, { title, active, body, actions }) {
  const { user, csrf, flash, devWarning, unread, siteName } = ctx;
  return (html`${head(title)}
<body class="admin">
<header class="a-top">
  <div class="a-top-in">
    <button class="a-menu" id="a-menu" type="button" aria-expanded="false" aria-controls="a-nav">মেনু</button>
    <a class="a-brand" href="/admin"><b>${siteName}</b><small>অ্যাডমিন প্যানেল</small></a>
    <div class="a-user">
      <a class="a-view" href="/" target="_blank" rel="noopener">সাইট দেখুন ↗</a>
      <span class="a-who">${user.displayName || user.username}</span>
      <form method="post" action="/admin/logout">${csrfInput(csrf)}<button type="submit" class="a-btn small ghost">লগআউট</button></form>
    </div>
  </div>
</header>
${devWarning ? html`<div class="dev-warn" role="alert"><b>সতর্কতা:</b> ডিফল্ট লগইন (admin / admin123) ব্যবহৃত হচ্ছে। প্রকাশের আগে ADMIN_PASSWORD ও SESSION_SECRET পরিবেশ-চলক সেট করুন।</div>` : ''}
<div class="a-shell">
  <nav class="a-nav" id="a-nav" aria-label="অ্যাডমিন মেনু">
    ${NAV.map((n) => html`<a href="${n.href}" class="${n.key === active ? 'active' : ''}"${n.key === active ? raw(' aria-current="page"') : ''}>${n.label}${n.key === 'enquiries' && unread ? html` <span class="badge">${bnDigits(unread)}</span>` : ''}</a>`)}
  </nav>
  <main class="a-main" id="main">
    <div class="a-head">
      <h1>${title}</h1>
      ${actions || ''}
    </div>
    ${flashBox(flash)}
    ${body}
  </main>
</div>
<script src="/js/admin.js" defer></script>
</body>
</html>`).toString();
}

function loginPage({ csrf, error, username, devWarning, siteName, locked }) {
  return (html`${head('লগইন')}
<body class="admin login-body">
<main class="login-card">
  <div class="login-brand">
    <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#0e3b2c" stroke="#d8ad4c" stroke-width="3"/><path d="M14 42 H50" stroke="#d8ad4c" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M20 42 A12 12 0 0 1 44 42" fill="#d8ad4c"/><g stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"><path d="M32 14 V22"/><path d="M19 19 L23.5 25"/><path d="M45 19 L40.5 25"/><path d="M13 30 L19 32"/><path d="M51 30 L45 32"/></g></svg>
    <div><b>${siteName}</b><small>অ্যাডমিন প্যানেলে প্রবেশ</small></div>
  </div>
  ${devWarning ? html`<div class="dev-warn boxed" role="alert">ডেভেলপমেন্ট মোড: ডিফল্ট লগইন: <b>admin</b> / <b>admin123</b> — প্রকাশের আগে বদলান।</div>` : ''}
  ${error ? html`<div class="flash error" role="alert">${error}</div>` : ''}
  <form method="post" action="/admin/login" class="a-form">
    ${csrfInput(csrf)}
    <label>ব্যবহারকারীর নাম<input type="text" name="username" autocomplete="username" required maxlength="60" value="${username || ''}" autofocus></label>
    <label>পাসওয়ার্ড<input type="password" name="password" autocomplete="current-password" required maxlength="200"></label>
    <button class="a-btn primary wide" type="submit"${locked ? raw(' disabled') : ''}>প্রবেশ করুন</button>
  </form>
  <p class="login-foot"><a href="/">← ওয়েবসাইটে ফিরে যান</a></p>
</main>
</body>
</html>`).toString();
}

// ---- dashboard -------------------------------------------------------------
function dashboard(ctx, { content, stats, audit }) {
  const cards = [
    ['বার্তা (অপঠিত)', stats.unread, '/admin/enquiries', stats.unread ? 'hot' : ''],
    ['মোট বার্তা', stats.enquiries, '/admin/enquiries', ''],
    ['প্রকাশিত নোটিশ', `${bnDigits(stats.noticesPublished)} / ${bnDigits(stats.notices)}`, '/admin/notices', ''],
    ['সেবা', stats.services, '/admin/services', ''],
    ['নেতৃত্ব কার্ড', stats.leaders, '/admin/leadership', ''],
    ['কোর্স', stats.courses, '/admin/training', ''],
    ['গ্যালারির ছবি', stats.gallery, '/admin/gallery', ''],
    ['মিডিয়া ফাইল', stats.media, '/admin/media', ''],
    ['ব্যবহারকারী', stats.users, '/admin/users', ''],
  ];
  const body = html`
  <p class="lead-muted">স্বাগতম, ${ctx.user.displayName || ctx.user.username}। বাম পাশের মেনু থেকে ওয়েবসাইটের যেকোনো অংশ সম্পাদনা করুন — সংরক্ষণের সঙ্গে সঙ্গে পাবলিক সাইটে পরিবর্তন দেখা যাবে।</p>
  <div class="stat-grid">
    ${cards.map(([label, value, href, cls]) => html`<a class="stat ${cls}" href="${href}"><small>${label}</small><b>${typeof value === 'number' ? bnDigits(value) : value}</b></a>`)}
  </div>
  <div class="a-grid2">
    <section class="a-card">
      <h2>দ্রুত কাজ</h2>
      <ul class="quick">
        <li><a href="/admin/notices/notices/items/new">নতুন নোটিশ প্রকাশ করুন</a></li>
        <li><a href="/admin/gallery">গ্যালারিতে ছবি যোগ করুন</a></li>
        <li><a href="/admin/training/training/courses/new">নতুন কোর্স যোগ করুন</a></li>
        <li><a href="/admin/settings">যোগাযোগের তথ্য হালনাগাদ করুন</a></li>
        <li><a href="/admin/backup">পূর্ণ ব্যাকআপ ডাউনলোড করুন</a></li>
      </ul>
    </section>
    <section class="a-card">
      <h2>সাম্প্রতিক পরিবর্তন</h2>
      ${audit.length ? html`<ul class="audit-mini">${audit.map((a) => html`<li><b>${a.user}</b> — ${a.action}: ${a.target}<small>${bnDateTime(a.at)}</small></li>`)}</ul>` : html`<p class="muted">এখনো কোনো পরিবর্তন হয়নি।</p>`}
      <p><a href="/admin/audit">পূর্ণ লগ দেখুন →</a></p>
    </section>
  </div>
  <p class="muted small">স্টোরেজ: ${stats.storage === 'mongodb' ? 'MongoDB' : 'লোকাল JSON ফাইল'} · বিষয়বস্তু ${content.sections.filter((s) => s.visible).length > 0 ? bnDigits(content.sections.filter((s) => s.visible).length) : '০'}টি অংশ দৃশ্যমান</p>`;
  return layout(ctx, { title: 'ড্যাশবোর্ড', active: 'dashboard', body });
}

// ---- generic field rendering ----------------------------------------------
function mediaPreview(id, mediaMap) {
  if (!id) return '';
  const m = mediaMap.get(id);
  if (!m) return html`<span class="muted small">ফাইল পাওয়া যায়নি (${id})</span>`;
  if (m.contentType.startsWith('image/')) return html`<a href="/media/${id}" target="_blank" rel="noopener"><img class="thumb" src="/media/${id}" alt=""></a>`;
  return html`<a class="file-chip" href="/media/${id}" target="_blank" rel="noopener">PDF: ${m.filename}</a>`;
}

function fieldRow(f, value, mediaMap, error) {
  const id = `f-${f.name}`;
  const req = f.required ? html` <span class="req">*</span>` : '';
  switch (f.type) {
    case 'meta': return '';
    case 'bool':
      return html`<div class="fr check"><label><input type="checkbox" name="${f.name}" value="on"${value ? raw(' checked') : ''}> ${f.label}</label></div>`;
    case 'textarea':
      return html`<div class="fr${error ? ' has-err' : ''}"><label for="${id}">${f.label}${req}</label><textarea id="${id}" name="${f.name}" rows="${f.max > 3000 ? 10 : 4}" maxlength="${f.max}">${value || ''}</textarea></div>`;
    case 'lines':
    case 'paragraphs':
      return html`<div class="fr"><label for="${id}">${f.label}${req}</label><textarea id="${id}" name="${f.name}" rows="8">${(value || []).join(f.type === 'lines' ? '\n' : '\n\n')}</textarea></div>`;
    case 'select':
      return html`<div class="fr"><label for="${id}">${f.label}${req}</label>
        <div class="icon-pick">
          ${f.options.map((o) => html`<label class="icon-opt" title="${o.label}"><input type="radio" name="${f.name}" value="${o.value}"${o.value === value ? raw(' checked') : ''}> ${raw(iconSvg(o.value, 'ico-sm'))}<span>${o.label}</span></label>`)}
        </div></div>`;
    case 'date':
      return html`<div class="fr"><label for="${id}">${f.label}${req}</label><input id="${id}" type="date" name="${f.name}" value="${value || ''}"></div>`;
    case 'image':
    case 'attachment': {
      const accept = f.type === 'image' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf';
      return html`<div class="fr file"><label for="${id}">${f.label}${req}</label>
        ${value ? html`<div class="cur">${mediaPreview(value, mediaMap)}<label class="inline"><input type="checkbox" name="remove_${f.name}" value="on"> সরিয়ে ফেলুন</label></div>` : ''}
        <input id="${id}" type="file" name="file_${f.name}" accept="${accept}">
        <small class="hint">${f.type === 'image' ? 'JPG, PNG বা WEBP' : 'PDF, JPG, PNG বা WEBP'}, সর্বোচ্চ ৫ MB।${value ? ' নতুন ফাইল দিলে আগেরটি প্রতিস্থাপিত হবে।' : ''}</small></div>`;
    }
    case 'images':
      return html`<div class="fr file"><label for="${id}">${f.label}</label>
        ${(value || []).length ? html`<div class="cur multi">${value.map((mid) => html`<div class="cur-item">${mediaPreview(mid, mediaMap)}<label class="inline"><input type="checkbox" name="remove_${f.name}" value="${mid}"> সরান</label></div>`)}</div>` : ''}
        <input id="${id}" type="file" name="file_${f.name}" accept="image/jpeg,image/png,image/webp" multiple>
        <small class="hint">একাধিক ছবি বাছাই করা যাবে। JPG, PNG বা WEBP, প্রতিটি সর্বোচ্চ ৫ MB।</small></div>`;
    default: {
      const type = f.type === 'email' ? 'email' : 'text';
      return html`<div class="fr"><label for="${id}">${f.label}${req}</label><input id="${id}" type="${type}" name="${f.name}" value="${value ?? ''}" maxlength="${f.max || 300}"${f.type === 'href' ? raw(' placeholder="https://… অথবা #contact"') : ''}></div>`;
    }
  }
}

function fieldsForm({ action, fields, values, mediaMap, csrf, submit = 'সংরক্ষণ করুন', extra = '' }) {
  return html`<form class="a-form" method="post" action="${action}" enctype="multipart/form-data">
    ${csrfInput(csrf)}
    ${fields.map((f) => fieldRow(f, values ? values[f.name] : undefined, mediaMap))}
    ${extra}
    <div class="form-actions"><button class="a-btn primary" type="submit">${submit}</button></div>
  </form>`;
}

function itemSummary(coll, item, mediaMap) {
  const title = item[coll.titleField] || '(শিরোনামহীন)';
  const bits = [];
  if ('visible' in item && !item.visible) bits.push(html`<span class="pill off">লুকানো</span>`);
  if ('published' in item) bits.push(item.published ? html`<span class="pill on">প্রকাশিত</span>` : html`<span class="pill off">খসড়া</span>`);
  if (item.date) bits.push(html`<span class="pill">${bnDate(item.date)}</span>`);
  if (item.tag) bits.push(html`<span class="pill">${item.tag}</span>`);
  if (item.status) bits.push(html`<span class="pill">${item.status}</span>`);
  const img = item.image || item.photo || (item.photos && item.photos[0]);
  return html`${img && mediaMap.has(img) ? html`<img class="row-thumb" src="/media/${img}" alt="">` : ''}<span class="row-title">${title}</span> ${bits}`;
}

function collectionBlock(ctx, page, nodeKey, collKey, items, mediaMap) {
  const coll = SCHEMA[nodeKey].collections[collKey];
  const base = `/admin/${page.slug}/${nodeKey}/${collKey}`;
  return html`<section class="a-card" id="c-${nodeKey}-${collKey}">
    <div class="card-head">
      <h2>${coll.label} <small class="muted">(${bnDigits(items.length)})</small></h2>
      ${items.length < coll.maxItems ? html`<a class="a-btn primary small" href="${base}/new">+ নতুন ${coll.itemLabel}</a>` : ''}
    </div>
    ${nodeKey === 'gallery' ? html`<form class="bulk" method="post" action="/admin/gallery/bulk" enctype="multipart/form-data">${csrfInput(ctx.csrf)}
      <label>একসঙ্গে একাধিক ছবি আপলোড: <input type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple required></label>
      <button class="a-btn small" type="submit">আপলোড করুন</button></form>` : ''}
    ${items.length ? html`<ul class="rows">
      ${items.map((item, i) => html`<li class="row-item">
        <div class="row-main">${itemSummary(coll, item, mediaMap)}</div>
        <div class="row-actions">
          ${coll.orderable ? html`
          <form method="post" action="${base}/${item.id}/move">${csrfInput(ctx.csrf)}<input type="hidden" name="dir" value="up"><button class="a-btn icon" type="submit" title="উপরে নিন" aria-label="উপরে নিন"${i === 0 ? raw(' disabled') : ''}>↑</button></form>
          <form method="post" action="${base}/${item.id}/move">${csrfInput(ctx.csrf)}<input type="hidden" name="dir" value="down"><button class="a-btn icon" type="submit" title="নিচে নিন" aria-label="নিচে নিন"${i === items.length - 1 ? raw(' disabled') : ''}>↓</button></form>` : ''}
          ${'visible' in item || 'published' in item ? html`<form method="post" action="${base}/${item.id}/toggle">${csrfInput(ctx.csrf)}<button class="a-btn small" type="submit">${('published' in item ? item.published : item.visible) ? 'লুকান' : 'প্রকাশ করুন'}</button></form>` : ''}
          <a class="a-btn small" href="${base}/${item.id}/edit">সম্পাদনা</a>
          <form method="post" action="${base}/${item.id}/delete" data-confirm="“${item[coll.titleField] || coll.itemLabel}” মুছে ফেলতে চান?">${csrfInput(ctx.csrf)}<button class="a-btn small danger" type="submit">মুছুন</button></form>
        </div>
      </li>`)}
    </ul>` : html`<p class="muted">এখনো কোনো ${coll.itemLabel} যোগ করা হয়নি।</p>`}
  </section>`;
}

function nodePage(ctx, page, content, mediaMap, override) {
  const body = page.nodes.map((nodeKey) => {
    const node = SCHEMA[nodeKey];
    const visibleFields = (node.fields || []).filter((f) => f.type !== 'meta');
    const obj = content[nodeKey];
    let items = (key) => obj[key];
    if (nodeKey === 'notices') {
      items = (key) => [...obj[key]].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
    }
    return html`
    ${visibleFields.length ? html`<section class="a-card" id="n-${nodeKey}">
      <h2>${node.label}</h2>
      ${fieldsForm({ action: `/admin/${page.slug}/${nodeKey}#n-${nodeKey}`, fields: visibleFields, values: override && override.nodeKey === nodeKey ? { ...obj, ...override.values } : obj, mediaMap, csrf: ctx.csrf })}
    </section>` : ''}
    ${Object.keys(node.collections || {}).map((ck) => collectionBlock(ctx, page, nodeKey, ck, items(ck), mediaMap))}`;
  });
  return layout(ctx, {
    title: page.title, active: page.slug,
    body: html`<p class="lead-muted">${page.desc}</p>${body}`,
  });
}

function itemPage(ctx, page, nodeKey, collKey, item, mediaMap, { isNew, errors }) {
  const coll = SCHEMA[nodeKey].collections[collKey];
  const base = `/admin/${page.slug}/${nodeKey}/${collKey}`;
  const title = isNew ? `নতুন ${coll.itemLabel}` : `${coll.itemLabel} সম্পাদনা`;
  const flash = errors && errors.length ? { type: 'error', msg: 'সংরক্ষণ করা যায়নি। নিচের ত্রুটিগুলো ঠিক করুন:', list: errors } : ctx.flash;
  const body = html`
    <p><a href="/admin/${page.slug}#c-${nodeKey}-${collKey}">← ${page.title}-এ ফিরে যান</a></p>
    <section class="a-card">
      ${fieldsForm({ action: isNew ? `${base}/new` : `${base}/${item.id}`, fields: coll.fields, values: item, mediaMap, csrf: ctx.csrf, submit: isNew ? 'যোগ করুন' : 'সংরক্ষণ করুন' })}
    </section>`;
  return layout({ ...ctx, flash }, { title, active: page.slug, body });
}

// ---- sections & nav order --------------------------------------------------
function sectionsPage(ctx, content) {
  const body = html`
  <p class="lead-muted">প্রথম পাতায় কোন অংশ কোন ক্রমে দেখাবে এবং উপরের মেনুতে কোনগুলো থাকবে তা এখানে ঠিক করুন। ক্রম নম্বর ছোট থেকে বড় অনুযায়ী সাজানো হবে। (হিরো অংশ সবসময় শীর্ষে থাকে; তথ্য-রেখা “পরিচিতি ও তথ্য-রেখা” পাতা থেকে নিয়ন্ত্রণ করুন।)</p>
  <section class="a-card">
  <form class="a-form" method="post" action="/admin/sections">
    ${csrfInput(ctx.csrf)}
    <div class="table-scroll">
    <table class="a-table">
      <thead><tr><th>ক্রম</th><th>অংশ</th><th>দৃশ্যমান</th><th>মেনুতে</th><th>মেনুর লেখা</th></tr></thead>
      <tbody>
        ${content.sections.map((s, i) => html`<tr>
          <td><input class="num" type="number" name="order_${s.key}" value="${i + 1}" min="1" max="99" aria-label="ক্রম"></td>
          <td><b>${SECTION_NAMES[s.key]}</b>${s.key === 'gallery' ? html`<br><small class="muted">ছবি না থাকলে স্বয়ংক্রিয়ভাবে লুকানো</small>` : ''}</td>
          <td><input type="checkbox" name="visible_${s.key}" value="on"${s.visible ? raw(' checked') : ''} aria-label="দৃশ্যমান"></td>
          <td><input type="checkbox" name="nav_${s.key}" value="on"${s.inNav ? raw(' checked') : ''} aria-label="মেনুতে"></td>
          <td><input type="text" name="label_${s.key}" value="${s.navLabel}" maxlength="60" aria-label="মেনুর লেখা"></td>
        </tr>`)}
      </tbody>
    </table>
    </div>
    <div class="form-actions"><button class="a-btn primary" type="submit">সংরক্ষণ করুন</button></div>
  </form>
  </section>`;
  return layout(ctx, { title: 'অংশ ও মেনুর ক্রম', active: 'sections', body });
}

// ---- enquiries -------------------------------------------------------------
function enquiriesPage(ctx, list) {
  const body = html`
  <p class="lead-muted">ওয়েবসাইটের যোগাযোগ ফর্ম থেকে আসা বার্তা। নতুন বার্তা প্রথমে দেখানো হয়।</p>
  ${list.length ? html`<div class="enq-list">
    ${list.map((e) => html`<article class="a-card enq ${e.read ? '' : 'unread'}">
      <div class="card-head">
        <h2>${e.subject}${e.read ? '' : html` <span class="pill hot">নতুন</span>`}</h2>
        <small class="muted">${bnDateTime(e.createdAt)}</small>
      </div>
      <dl class="enq-meta">
        <dt>নাম</dt><dd>${e.name}</dd>
        <dt>মোবাইল</dt><dd><a href="tel:${e.phone}">${e.phone}</a></dd>
        ${e.email ? html`<dt>ই-মেইল</dt><dd><a href="mailto:${e.email}">${e.email}</a></dd>` : ''}
      </dl>
      <p class="enq-msg">${nl2br(e.message)}</p>
      <div class="row-actions">
        <form method="post" action="/admin/enquiries/${e.id}/read">${csrfInput(ctx.csrf)}<input type="hidden" name="read" value="${e.read ? '0' : '1'}"><button class="a-btn small" type="submit">${e.read ? 'অপঠিত চিহ্নিত করুন' : 'পঠিত চিহ্নিত করুন'}</button></form>
        <form method="post" action="/admin/enquiries/${e.id}/delete" data-confirm="এই বার্তাটি মুছে ফেলতে চান?">${csrfInput(ctx.csrf)}<button class="a-btn small danger" type="submit">মুছুন</button></form>
      </div>
    </article>`)}
  </div>` : html`<div class="a-card"><p class="muted">এখনো কোনো বার্তা আসেনি।</p></div>`}`;
  return layout(ctx, { title: 'বার্তা (এনকোয়ারি)', active: 'enquiries', body });
}

// ---- users -----------------------------------------------------------------
function usersPage(ctx, users) {
  const isOwner = ctx.user.role === 'owner';
  const body = html`
  <section class="a-card">
    <h2>ব্যবহারকারীর তালিকা</h2>
    <div class="table-scroll"><table class="a-table">
      <thead><tr><th>ব্যবহারকারীর নাম</th><th>প্রদর্শিত নাম</th><th>ভূমিকা</th><th>তৈরি</th><th>শেষ লগইন</th><th></th></tr></thead>
      <tbody>
      ${users.map((u) => html`<tr>
        <td><b>${u.username}</b>${u.id === ctx.user.id ? html` <span class="pill">আপনি</span>` : ''}</td>
        <td>${u.displayName || ''}</td>
        <td>${u.role === 'owner' ? 'মালিক (প্রধান অ্যাডমিন)' : 'অ্যাডমিন'}</td>
        <td>${bnDateTime(u.createdAt)}</td>
        <td>${u.lastLoginAt ? bnDateTime(u.lastLoginAt) : '—'}</td>
        <td>${isOwner && u.id !== ctx.user.id && u.role !== 'owner' ? html`<form method="post" action="/admin/users/${u.id}/delete" data-confirm="ব্যবহারকারী “${u.username}” মুছে ফেলতে চান?">${csrfInput(ctx.csrf)}<button class="a-btn small danger" type="submit">মুছুন</button></form>` : ''}</td>
      </tr>`)}
      </tbody>
    </table></div>
  </section>
  <div class="a-grid2">
    <section class="a-card">
      <h2>নিজের পাসওয়ার্ড পরিবর্তন</h2>
      <form class="a-form" method="post" action="/admin/users/password">
        ${csrfInput(ctx.csrf)}
        <div class="fr"><label>বর্তমান পাসওয়ার্ড<input type="password" name="current" autocomplete="current-password" required></label></div>
        <div class="fr"><label>নতুন পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)<input type="password" name="next" autocomplete="new-password" minlength="10" required></label></div>
        <div class="fr"><label>নতুন পাসওয়ার্ড আবার<input type="password" name="confirm" autocomplete="new-password" minlength="10" required></label></div>
        <div class="form-actions"><button class="a-btn primary" type="submit">পাসওয়ার্ড পরিবর্তন করুন</button></div>
      </form>
    </section>
    <section class="a-card">
      <h2>নতুন ব্যবহারকারী</h2>
      ${isOwner ? html`<form class="a-form" method="post" action="/admin/users">
        ${csrfInput(ctx.csrf)}
        <div class="fr"><label>ব্যবহারকারীর নাম (ইংরেজি ছোট হাতের অক্ষর, সংখ্যা, . _ -)<input type="text" name="username" pattern="[a-z0-9._\\-]{3,40}" maxlength="40" required autocomplete="off"></label></div>
        <div class="fr"><label>প্রদর্শিত নাম<input type="text" name="displayName" maxlength="80"></label></div>
        <div class="fr"><label>পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)<input type="password" name="password" minlength="10" required autocomplete="new-password"></label></div>
        <div class="form-actions"><button class="a-btn primary" type="submit">ব্যবহারকারী তৈরি করুন</button></div>
      </form>` : html`<p class="muted">শুধু মালিক (প্রধান অ্যাডমিন) নতুন ব্যবহারকারী তৈরি বা মুছতে পারেন।</p>`}
    </section>
  </div>`;
  return layout(ctx, { title: 'ব্যবহারকারী', active: 'users', body });
}

// ---- media -----------------------------------------------------------------
function mediaPage(ctx, list, refs) {
  const body = html`
  <p class="lead-muted">আপলোড করা সব ছবি ও PDF। কোনো ফাইল সাইটে ব্যবহৃত হলে তা মোছা যাবে না — আগে সংশ্লিষ্ট অংশ থেকে সরিয়ে নিন।</p>
  <section class="a-card">
    <h2>ফাইল আপলোড</h2>
    <form class="bulk" method="post" action="/admin/media" enctype="multipart/form-data">${csrfInput(ctx.csrf)}
      <input type="file" name="files" accept="image/jpeg,image/png,image/webp,application/pdf" multiple required>
      <button class="a-btn small primary" type="submit">আপলোড করুন</button>
    </form>
    <small class="hint">JPG, PNG, WEBP বা PDF; প্রতিটি সর্বোচ্চ ৫ MB।</small>
  </section>
  ${list.length ? html`<div class="media-grid">
    ${list.map((m) => {
      const used = refs.get(m.id) || [];
      return html`<figure class="a-card media-card">
        ${m.contentType.startsWith('image/') ? html`<a href="/media/${m.id}" target="_blank" rel="noopener"><img src="/media/${m.id}" alt="" loading="lazy"></a>` : html`<a class="pdf-box" href="/media/${m.id}" target="_blank" rel="noopener">PDF</a>`}
        <figcaption>
          <b title="${m.filename}">${m.filename}</b>
          <small>${bnSize(m.size)} · ${bnDateTime(m.createdAt)}</small>
          <small class="mono">/media/${m.id}</small>
          ${used.length ? html`<small class="used">ব্যবহৃত: ${used.join('; ')}</small>` : html`<small class="muted">অব্যবহৃত</small>`}
          ${used.length ? '' : html`<form method="post" action="/admin/media/${m.id}/delete" data-confirm="ফাইলটি স্থায়ীভাবে মুছে ফেলতে চান?">${csrfInput(ctx.csrf)}<button class="a-btn small danger" type="submit">মুছুন</button></form>`}
        </figcaption>
      </figure>`;
    })}
  </div>` : html`<div class="a-card"><p class="muted">এখনো কোনো ফাইল আপলোড হয়নি।</p></div>`}`;
  return layout(ctx, { title: 'মিডিয়া লাইব্রেরি', active: 'media', body });
}

// ---- audit -----------------------------------------------------------------
function auditPage(ctx, list) {
  const body = html`
  <p class="lead-muted">অ্যাডমিন প্যানেলে করা সব পরিবর্তনের রেকর্ড (সর্বশেষ ৫০০টি)।</p>
  <section class="a-card"><div class="table-scroll"><table class="a-table">
    <thead><tr><th>সময়</th><th>ব্যবহারকারী</th><th>কাজ</th><th>বিষয়</th><th>IP</th></tr></thead>
    <tbody>${list.map((a) => html`<tr><td class="nowrap">${bnDateTime(a.at)}</td><td>${a.user}</td><td>${a.action}</td><td>${a.target}</td><td class="mono small">${a.ip || ''}</td></tr>`)}</tbody>
  </table></div>${list.length ? '' : html`<p class="muted">কোনো রেকর্ড নেই।</p>`}</section>`;
  return layout(ctx, { title: 'কার্যক্রমের লগ', active: 'audit', body });
}

// ---- backup ----------------------------------------------------------------
function backupPage(ctx) {
  const body = html`
  <div class="a-grid2">
    <section class="a-card">
      <h2>ব্যাকআপ ডাউনলোড (এক্সপোর্ট)</h2>
      <p>পুরো ওয়েবসাইটের বিষয়বস্তু একটি JSON ফাইলে ডাউনলোড করুন। নিয়মিত (যেমন মাসে একবার ও বড় পরিবর্তনের আগে) ব্যাকআপ রাখুন।</p>
      <form class="a-form" method="post" action="/admin/backup/export">
        ${csrfInput(ctx.csrf)}
        <div class="fr check"><label><input type="checkbox" name="media" value="on" checked> ছবি ও PDF ফাইলসহ (ফাইল বড় হতে পারে)</label></div>
        <div class="fr check"><label><input type="checkbox" name="enquiries" value="on"> যোগাযোগ ফর্মের বার্তাসহ</label></div>
        <div class="form-actions"><button class="a-btn primary" type="submit">ব্যাকআপ ডাউনলোড করুন</button></div>
      </form>
    </section>
    <section class="a-card">
      <h2>রিস্টোর (ইমপোর্ট)</h2>
      <p><b>সতর্কতা:</b> ইমপোর্ট করলে বর্তমান সব বিষয়বস্তু ব্যাকআপ ফাইলের বিষয়বস্তু দিয়ে প্রতিস্থাপিত হবে। ব্যাকআপে থাকা ছবি/PDF পুনরায় যুক্ত হবে। ব্যবহারকারী ও লগইন অপরিবর্তিত থাকবে।</p>
      <form class="a-form" method="post" action="/admin/backup/import" enctype="multipart/form-data" data-confirm="বর্তমান বিষয়বস্তু প্রতিস্থাপন করে ব্যাকআপ রিস্টোর করতে চান?">
        ${csrfInput(ctx.csrf)}
        <div class="fr"><label>ব্যাকআপ ফাইল (.json)<input type="file" name="backup" accept="application/json,.json" required></label></div>
        <div class="form-actions"><button class="a-btn danger" type="submit">রিস্টোর করুন</button></div>
      </form>
    </section>
  </div>`;
  return layout(ctx, { title: 'ব্যাকআপ ও রিস্টোর', active: 'backup', body });
}

function errorPage(ctx, title, msg) {
  return layout(ctx, { title, active: '', body: html`<div class="a-card"><p>${msg}</p><p><a href="/admin">ড্যাশবোর্ডে ফিরে যান</a></p></div>` });
}

module.exports = {
  ADMIN_PAGES, PAGE_BY_SLUG, loginPage, dashboard, nodePage, itemPage, sectionsPage,
  enquiriesPage, usersPage, mediaPage, auditPage, backupPage, errorPage,
};
