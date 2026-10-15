'use strict';

// Public website rendering (server-side, all content HTML-escaped via html``).

const { html, raw, nl2br, safeHref, bnDigits, bnDate } = require('../util/html');
const { iconSvg, LOGO_SVG } = require('./icons');

const media = (id) => `/media/${id}`;

// "#about" works on the home page; elsewhere it must point back to "/#about".
function link(href, isHome) {
  const h = safeHref(href);
  return !isHome && h.startsWith('#') ? '/' + h : h;
}

function publishedNotices(content) {
  return (content.notices.items || [])
    .filter((n) => n.published)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
}

function sectionHead(kicker, heading, intro) {
  return html`<div class="sec-head">
        ${kicker ? html`<span class="kicker">${kicker}</span>` : ''}
        <h2>${heading}</h2>
        <div class="rule"></div>
        ${intro ? html`<p>${intro}</p>` : ''}
      </div>`;
}

function layout(c, { title, description, isHome, body }) {
  const site = c.site;
  const nav = c.sections.filter((s) => s.inNav && s.visible && s.navLabel && sectionHasContent(c, s.key));
  const year = bnDigits(new Date().getFullYear());
  const f = c.footer;
  return html`<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title || site.metaTitle}</title>
<meta name="description" content="${description || site.metaDescription}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600&family=Noto+Serif+Bengali:wght@600;700;800&display=swap">
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
<header class="topbar">
  <div class="wrap">
    <a class="brand" href="${isHome ? '#home' : '/'}" aria-label="${site.nameBn} — প্রথম পাতা">
      ${site.logo ? html`<img class="logo-img" src="${media(site.logo)}" alt="" width="44" height="44">` : raw(LOGO_SVG)}
      <span><b>${site.nameBn}</b>${site.nameEn ? html`<small>${site.nameEn}</small>` : ''}</span>
    </a>
    <button class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="site-nav">${site.menuLabel}</button>
    <nav class="nav" id="site-nav" aria-label="প্রধান মেনু">
      ${nav.map((s) => html`
      <a href="${isHome ? '#' + s.key : '/#' + s.key}">${s.navLabel}</a>`)}
    </nav>
  </div>
</header>

${body}

<footer>
  <div class="wrap">
    <div>
      <h3>${f.title}</h3>
      ${f.statement ? html`<p>${f.statement}</p>` : ''}
      ${f.showContact ? html`<p>${c.contact.address}</p>
      <p>${[c.contact.phone ? `${c.contact.phoneLabel}: ${c.contact.phone}` : '', c.contact.email ? `${c.contact.emailLabel}: ${c.contact.email}` : ''].filter(Boolean).join(' · ')}</p>` : ''}
    </div>
    <div>
      <h3>${f.quickLinksTitle}</h3>
      <ul>
        ${f.quickLinks.map((l) => html`<li><a href="${link(l.href, isHome)}">${l.label}</a></li>
        `)}
      </ul>
    </div>
    <div>
      <h3>${f.registrationTitle}</h3>
      <ul>
        ${f.registration.map((r) => html`<li>${r.label}: ${r.value}</li>
        `)}
      </ul>
    </div>
  </div>
  <div class="copyright"><div class="wrap">© <span id="year">${year}</span> ${site.nameBn}। ${f.copyright}</div></div>
</footer>

<script src="/js/site.js" defer></script>
</body>
</html>`;
}

function sectionHasContent(c, key) {
  if (key === 'gallery') return c.gallery.items.length > 0;
  return true;
}

// ---- sections -------------------------------------------------------------
const SECTIONS = {
  about(c) {
    const a = c.about;
    return html`${sectionHead(a.kicker, a.heading)}
      <div class="about-grid">
        <div>
          ${a.paragraphs.map((p) => html`<p>${p}</p>
          `)}
        </div>
        <div class="table-wrap">
          <table class="info">
            <tbody>
              ${a.rows.map((r) => html`<tr><th scope="row">${r.label}</th><td>${nl2br(r.value)}</td></tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  leadership(c) {
    const l = c.leadership;
    return html`${sectionHead(l.kicker, l.heading)}
      <div class="leaders">
        ${l.leaders.filter((x) => x.visible).map((x) => html`<article class="leader">
          ${x.photo
            ? html`<img class="avatar avatar-photo" src="${media(x.photo)}" alt="${x.name}" width="64" height="64" loading="lazy">`
            : html`<div class="avatar" aria-hidden="true">${x.avatarText || (x.name || '').slice(0, 1)}</div>`}
          <div>
            ${x.role ? html`<div class="role">${x.role}</div>` : ''}
            <h3>${x.name}</h3>
            ${x.postNominals ? html`<p class="post">${x.postNominals}</p>` : ''}
            ${x.bio ? html`<p>${x.bio}</p>` : ''}
          </div>
        </article>
        `)}
      </div>`;
  },

  services(c) {
    const s = c.services;
    return html`${sectionHead(s.kicker, s.heading, s.intro)}
      <div class="services">
        ${s.items.filter((x) => x.visible).map((x) => html`<article class="svc">
          ${raw(iconSvg(x.icon))}
          <h3>${x.title}</h3>
          ${x.tag ? html`<span class="tag">${x.tag}</span>` : ''}
          ${x.description ? html`<p>${x.description}</p>` : ''}
        </article>
        `)}
      </div>
      ${s.more ? html`<p class="more">${s.more}</p>` : ''}`;
  },

  training(c) {
    const t = c.training;
    const courses = t.courses.filter((x) => x.visible);
    return html`${sectionHead(t.kicker, t.heading, t.intro)}
      <div class="split">
        <div class="panel">
          <h3>${t.typesTitle}</h3>
          <ul>
            ${t.types.map((x) => html`<li>${x}</li>
            `)}
          </ul>
        </div>
        <div class="panel">
          <h3>${t.courseInfoTitle}</h3>
          <p>${nl2br(t.courseInfo)}</p>
        </div>
      </div>
      ${courses.length ? html`<div class="courses">
        ${t.coursesTitle ? html`<h3 class="courses-title">${t.coursesTitle}</h3>` : ''}
        <div class="course-list">
          ${courses.map((x) => html`<article class="course">
            <div class="course-head"><h3>${x.name}</h3>${x.status ? html`<span class="tag">${x.status}</span>` : ''}</div>
            <dl class="course-meta">
              ${x.duration ? html`<div><dt>মেয়াদ</dt><dd>${x.duration}</dd></div>` : ''}
              ${x.fee ? html`<div><dt>ফি</dt><dd>${x.fee}</dd></div>` : ''}
              ${x.seats ? html`<div><dt>আসন</dt><dd>${x.seats}</dd></div>` : ''}
            </dl>
            ${x.description ? html`<p>${nl2br(x.description)}</p>` : ''}
          </article>
          `)}
        </div>
      </div>` : ''}`;
  },

  overseas(c) {
    const o = c.overseas;
    return html`${sectionHead(o.kicker, o.heading)}
      ${o.noticeVisible && o.noticeText ? html`<div class="notice" role="note">
        ${o.noticeLabel ? html`<b>${o.noticeLabel}</b>` : ''}
        <span>${o.noticeText}</span>
      </div>` : ''}
      <ol class="steps">
        ${o.steps.map((x) => html`<li><h3>${x.title}</h3>${x.text ? html`<p>${x.text}</p>` : ''}</li>
        `)}
      </ol>`;
  },

  resort(c) {
    const r = c.resorts;
    return html`${sectionHead(r.kicker, r.heading)}
      <div class="split">
        ${r.items.filter((x) => x.visible).map((x) => html`<div class="panel">
          <h3>${x.name}</h3>
          ${x.description ? html`<p>${nl2br(x.description)}</p>` : ''}
          ${x.photos.length ? html`<div class="photo-row">${x.photos.map((p) => html`<a href="${media(p)}" target="_blank" rel="noopener"><img src="${media(p)}" alt="${x.name}" loading="lazy"></a>`)}</div>` : ''}
          ${x.booking ? html`<p class="booking"><b>বুকিং:</b> ${nl2br(x.booking)}</p>` : ''}
        </div>
        `)}
      </div>`;
  },

  structure(c) {
    const s = c.structure;
    return html`${sectionHead(s.kicker, s.heading)}
      <div class="modules">
        ${s.modules.map((m) => html`<div class="module"><h3>${m.title}</h3>${m.description ? html`<p>${m.description}</p>` : ''}${m.officer ? html`<p class="who">${m.officer}</p>` : ''}</div>
        `)}
      </div>`;
  },

  notice(c) {
    const n = c.notices;
    const items = publishedNotices(c);
    return html`${sectionHead(n.kicker, n.heading)}
      ${items.length ? html`<ul class="notice-list">
        ${items.map((x) => html`<li class="notice-item">
          <time datetime="${x.date}">${bnDate(x.date)}</time>
          <div>
            <h3><a href="/notices/${x.id}">${x.title}</a></h3>
            ${x.body ? html`<p>${excerpt(x.body)}</p>` : ''}
            ${x.attachment ? html`<a class="attach" href="${media(x.attachment)}" target="_blank" rel="noopener">সংযুক্তি দেখুন</a>` : ''}
          </div>
        </li>
        `)}
      </ul>` : html`<div class="empty">${n.emptyText}</div>`}`;
  },

  gallery(c) {
    const g = c.gallery;
    return html`${sectionHead(g.kicker, g.heading)}
      <div class="gallery">
        ${g.items.map((x) => html`<figure>
          <a href="${media(x.image)}" target="_blank" rel="noopener"><img src="${media(x.image)}" alt="${x.caption}" loading="lazy"></a>
          ${x.caption ? html`<figcaption>${x.caption}</figcaption>` : ''}
        </figure>
        `)}
      </div>`;
  },

  contact(c, opts) {
    const k = c.contact;
    const enq = opts.enquiry || {};
    const v = enq.values || {};
    const err = enq.errors || [];
    return html`${sectionHead(k.kicker, k.heading)}
      <div class="contact">
        <div>
          <p class="addr" id="addr">${nl2br(k.address)}</p>
          <div class="row">
            ${k.copyLabel ? html`<button class="copy" id="copy-addr" type="button">${k.copyLabel}</button>` : ''}
            ${k.mapUrl ? html`<a class="btn line" href="${safeHref(k.mapUrl)}" target="_blank" rel="noopener">${k.mapLabel}</a>` : ''}
          </div>
          <p class="status" id="copy-status" aria-live="polite"></p>
        </div>
        <dl class="cinfo">
          ${k.phone ? html`<dt>${k.phoneLabel}</dt><dd>${k.phone}</dd>` : ''}
          ${k.email ? html`<dt>${k.emailLabel}</dt><dd>${k.email}</dd>` : ''}
          ${k.parentUrl ? html`<dt>${k.parentLabel}</dt><dd><a href="${safeHref(k.parentUrl)}" target="_blank" rel="noopener">${k.parentText || k.parentUrl}</a></dd>` : ''}
          ${k.officeHours ? html`<dt>${k.hoursLabel}</dt><dd>${k.officeHours}</dd>` : ''}
        </dl>
      </div>
      ${k.formEnabled ? html`<div class="enquiry" id="enquiry">
        <div class="enquiry-head">
          <h3>${k.formTitle}</h3>
          ${k.formIntro ? html`<p>${k.formIntro}</p>` : ''}
        </div>
        ${opts.enquirySent ? html`<p class="form-msg ok" role="status">ধন্যবাদ! আপনার বার্তা পাঠানো হয়েছে। আমরা শীঘ্রই যোগাযোগ করব।</p>` : ''}
        ${err.length ? html`<div class="form-msg err" role="alert"><b>বার্তা পাঠানো যায়নি:</b><ul>${err.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
        <form class="enquiry-form" method="post" action="/enquiry#enquiry" novalidate>
          <div class="hp" aria-hidden="true"><label><span class="lbl">ওয়েবসাইট</span><input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
          <label><span class="lbl">নাম <span class="req">*</span></span><input type="text" name="name" maxlength="100" required value="${v.name || ''}" autocomplete="name"></label>
          <label><span class="lbl">মোবাইল নম্বর <span class="req">*</span></span><input type="tel" name="phone" maxlength="20" required value="${v.phone || ''}" autocomplete="tel" inputmode="tel"></label>
          <label><span class="lbl">ই-মেইল (ঐচ্ছিক)</span><input type="email" name="email" maxlength="200" value="${v.email || ''}" autocomplete="email"></label>
          <label><span class="lbl">বিষয় <span class="req">*</span></span><input type="text" name="subject" maxlength="150" required value="${v.subject || ''}"></label>
          <label class="full"><span class="lbl">বার্তা <span class="req">*</span></span><textarea name="message" rows="5" maxlength="3000" required>${v.message || ''}</textarea></label>
          <div class="full"><button class="btn solid" type="submit">বার্তা পাঠান</button></div>
        </form>
      </div>` : ''}`;
  },
};

function excerpt(text, n = 180) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}

function renderHome(c, opts = {}) {
  const h = c.hero;
  const visible = c.sections.filter((s) => s.visible && SECTIONS[s.key] && sectionHasContent(c, s.key));
  const body = html`<main id="home">
  <section class="hero">
    <div class="wrap">
      <div>
        ${h.eyebrow ? html`<p class="eyebrow">${h.eyebrow}</p>` : ''}
        <h1>${h.headingMain}${h.headingAccent ? html` <span>${h.headingAccent}</span>` : ''}</h1>
        ${h.lead ? html`<p class="lead">${h.lead}</p>` : ''}
        <div class="cta">
          ${h.cta1Label ? html`<a class="btn solid" href="${safeHref(h.cta1Href)}">${h.cta1Label}</a>` : ''}
          ${h.cta2Label ? html`<a class="btn ghost" href="${safeHref(h.cta2Href)}">${h.cta2Label}</a>` : ''}
        </div>
      </div>
      ${h.pillars.length ? html`<div class="pillars" aria-label="${h.pillarsLabel}">
        ${h.pillars.map((p) => html`<div class="pillar"><b>${p.title}</b><span>${p.text}</span></div>
        `)}
      </div>` : ''}
    </div>
  </section>

  ${c.facts.visible && c.facts.items.length ? html`<div class="facts">
    <div class="wrap">
      ${c.facts.items.map((x) => html`<div class="fact"><small>${x.label}</small><b>${x.value}</b></div>
      `)}
    </div>
  </div>` : ''}

  ${visible.map((s, i) => html`
  <section class="block${i % 2 === 1 ? ' alt' : ''}" id="${s.key}">
    <div class="wrap">
      ${SECTIONS[s.key](c, opts)}
    </div>
  </section>
  `)}
</main>`;
  return layout(c, { isHome: true, body }).toString();
}

function renderNoticePage(c, n) {
  const body = html`<main id="home">
  <section class="block page-block">
    <div class="wrap">
      <p class="crumbs"><a href="/">প্রথম পাতা</a> › <a href="/#notice">${c.notices.heading}</a></p>
      <article class="notice-detail">
        <time datetime="${n.date}">${bnDate(n.date)}</time>
        <h1>${n.title}</h1>
        <div class="rule"></div>
        ${n.body ? n.body.split(/\n\s*\n/).map((p) => html`<p>${nl2br(p.trim())}</p>`) : ''}
        ${n.attachment ? html`<p><a class="btn line" href="${media(n.attachment)}" target="_blank" rel="noopener">সংযুক্তি দেখুন / ডাউনলোড করুন</a></p>` : ''}
        <p><a class="back" href="/#notice">← সব নোটিশ</a></p>
      </article>
    </div>
  </section>
</main>`;
  return layout(c, { isHome: false, title: `${n.title} | ${c.site.nameBn}`, description: excerpt(n.body || n.title, 160), body }).toString();
}

function renderNotFound(c) {
  const body = html`<main id="home"><section class="block page-block"><div class="wrap">
    <div class="empty"><h1 class="nf-title">পাতাটি পাওয়া যায়নি</h1><p>আপনি যে পাতাটি খুঁজছেন তা নেই বা সরিয়ে ফেলা হয়েছে।</p><p><a class="btn line" href="/">প্রথম পাতায় ফিরে যান</a></p></div>
  </div></section></main>`;
  return layout(c, { isHome: false, title: `পাতা পাওয়া যায়নি | ${c.site.nameBn}`, body }).toString();
}

module.exports = { renderHome, renderNoticePage, renderNotFound, publishedNotices };
