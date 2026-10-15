'use strict';

// Single source of truth for the shape of site content.
// Used for: admin form generation, server-side validation of every save,
// validation of imported backups, and normalisation of stored content.

const crypto = require('node:crypto');
const { ICONS } = require('./views/icons');

const ID_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;
const MEDIA_ID_RE = /^[a-f0-9]{24}$/;

function newId() { return crypto.randomBytes(12).toString('hex'); }
function isId(v) { return typeof v === 'string' && ID_RE.test(v); }
function isMediaId(v) { return typeof v === 'string' && MEDIA_ID_RE.test(v); }

// ---- field builders -------------------------------------------------------
const text = (name, label, o = {}) => ({ name, label, type: 'text', max: 300, ...o });
const area = (name, label, o = {}) => ({ name, label, type: 'textarea', max: 5000, ...o });
const href = (name, label, o = {}) => ({ name, label, type: 'href', max: 500, ...o });
const bool = (name, label, o = {}) => ({ name, label, type: 'bool', ...o });
const lines = (name, label, o = {}) => ({ name, label, type: 'lines', max: 300, maxItems: 50, ...o });
const paras = (name, label, o = {}) => ({ name, label, type: 'paragraphs', max: 3000, maxItems: 20, ...o });
const image = (name, label, o = {}) => ({ name, label, type: 'image', ...o });
const images = (name, label, o = {}) => ({ name, label, type: 'images', maxItems: 20, ...o });
const attachment = (name, label, o = {}) => ({ name, label, type: 'attachment', ...o });
const date = (name, label, o = {}) => ({ name, label, type: 'date', ...o });
const select = (name, label, options, o = {}) => ({ name, label, type: 'select', options, ...o });
const meta = (name) => ({ name, label: name, type: 'meta' });

const kicker = text('kicker', 'ছোট শিরোনাম (কিকার)');
const heading = text('heading', 'শিরোনাম', { required: true });

const ICON_OPTIONS = Object.entries(ICONS).map(([value, i]) => ({ value, label: i.label }));

// Each top-level node: { label, fields: [...], collections: { key: { label, itemLabel, titleField, fields, orderable } } }
const SCHEMA = {
  site: {
    label: 'সাধারণ তথ্য',
    fields: [
      text('nameBn', 'প্রতিষ্ঠানের নাম (বাংলা)', { required: true }),
      text('nameEn', 'প্রতিষ্ঠানের নাম (ইংরেজি)'),
      text('metaTitle', 'ব্রাউজার শিরোনাম (title)', { required: true }),
      area('metaDescription', 'সার্চ ইঞ্জিন বিবরণ (meta description)', { max: 500 }),
      image('logo', 'লোগো (খালি রাখলে ডিফল্ট প্রতীক দেখাবে)'),
      text('menuLabel', 'মোবাইল মেনু বোতামের লেখা', { required: true, max: 40 }),
    ],
  },
  hero: {
    label: 'হিরো অংশ',
    fields: [
      text('eyebrow', 'উপরের ছোট লেখা'),
      text('headingMain', 'মূল শিরোনাম (প্রথম অংশ)', { required: true }),
      text('headingAccent', 'মূল শিরোনাম (সোনালি অংশ)'),
      area('lead', 'ভূমিকা অনুচ্ছেদ', { max: 1000 }),
      text('cta1Label', 'প্রথম বোতামের লেখা'),
      href('cta1Href', 'প্রথম বোতামের লিংক'),
      text('cta2Label', 'দ্বিতীয় বোতামের লেখা'),
      href('cta2Href', 'দ্বিতীয় বোতামের লিংক'),
      text('pillarsLabel', 'স্তম্ভ অংশের বর্ণনা (স্ক্রিন রিডারের জন্য)'),
    ],
    collections: {
      pillars: { label: 'মূল স্তম্ভসমূহ', itemLabel: 'স্তম্ভ', titleField: 'title', orderable: true, maxItems: 8,
        fields: [text('title', 'শিরোনাম', { required: true }), text('text', 'বিবরণ')] },
    },
  },
  facts: {
    label: 'তথ্য-রেখা (হিরোর নিচে)',
    fields: [bool('visible', 'তথ্য-রেখা দেখাবে')],
    collections: {
      items: { label: 'তথ্য-রেখার ঘর', itemLabel: 'ঘর', titleField: 'label', orderable: true, maxItems: 8,
        fields: [text('label', 'লেবেল', { required: true }), text('value', 'মান', { required: true })] },
    },
  },
  about: {
    label: 'আমাদের সম্পর্কে',
    fields: [kicker, heading, paras('paragraphs', 'অনুচ্ছেদসমূহ (প্রতিটি অনুচ্ছেদের মাঝে একটি ফাঁকা লাইন দিন)')],
    collections: {
      rows: { label: 'তথ্য সারণি', itemLabel: 'সারি', titleField: 'label', orderable: true, maxItems: 30,
        fields: [text('label', 'বিষয়', { required: true }), area('value', 'মান (নতুন লাইন দিলে লাইন ভাঙবে)', { required: true, max: 1000 })] },
    },
  },
  leadership: {
    label: 'নেতৃত্ব',
    fields: [kicker, heading],
    collections: {
      leaders: { label: 'নেতৃবৃন্দ', itemLabel: 'নেতৃত্ব কার্ড', titleField: 'name', orderable: true, maxItems: 30,
        fields: [
          text('name', 'নাম', { required: true }),
          text('role', 'পদবি'),
          text('postNominals', 'পদক/ডিগ্রি (নামের পরের অক্ষর)'),
          area('bio', 'সংক্ষিপ্ত পরিচিতি', { max: 2000 }),
          text('avatarText', 'ছবি না থাকলে বৃত্তের লেখা (১–৩ অক্ষর)', { max: 6 }),
          image('photo', 'ছবি'),
          bool('visible', 'প্রকাশিত'),
        ] },
    },
  },
  services: {
    label: 'সেবাসমূহ',
    fields: [kicker, heading, area('intro', 'ভূমিকা', { max: 1000 }), area('more', 'নিচের অতিরিক্ত লাইন', { max: 2000 })],
    collections: {
      items: { label: 'সেবা', itemLabel: 'সেবা', titleField: 'title', orderable: true, maxItems: 40,
        fields: [
          text('title', 'শিরোনাম', { required: true }),
          select('icon', 'আইকন', ICON_OPTIONS, { required: true }),
          text('tag', 'স্ট্যাটাস ট্যাগ (ঐচ্ছিক)', { max: 60 }),
          area('description', 'বিবরণ', { max: 1500 }),
          bool('visible', 'প্রকাশিত'),
        ] },
    },
  },
  training: {
    label: 'প্রশিক্ষণ',
    fields: [
      kicker, heading, area('intro', 'ভূমিকা', { max: 1000 }),
      text('typesTitle', 'প্রশিক্ষণের ধরন — শিরোনাম'),
      lines('types', 'প্রশিক্ষণের ধরন (প্রতি লাইনে একটি)'),
      text('courseInfoTitle', 'কোর্স তথ্য — শিরোনাম'),
      area('courseInfo', 'কোর্স ও ভর্তির তথ্য', { max: 2000 }),
      text('coursesTitle', 'কোর্স তালিকার শিরোনাম'),
    ],
    collections: {
      courses: { label: 'কোর্স তালিকা', itemLabel: 'কোর্স', titleField: 'name', orderable: true, maxItems: 100,
        fields: [
          text('name', 'কোর্সের নাম', { required: true }),
          text('duration', 'মেয়াদ', { max: 100 }),
          text('fee', 'ফি', { max: 100 }),
          text('seats', 'আসন সংখ্যা', { max: 100 }),
          text('status', 'অবস্থা (যেমন: ভর্তি চলছে)', { max: 100 }),
          area('description', 'বিবরণ', { max: 1500 }),
          bool('visible', 'প্রকাশিত'),
        ] },
    },
  },
  overseas: {
    label: 'বৈদেশিক কর্মসংস্থান',
    fields: [
      kicker, heading,
      bool('noticeVisible', 'বিজ্ঞপ্তি বাক্স দেখাবে'),
      text('noticeLabel', 'বিজ্ঞপ্তির লেবেল', { max: 60 }),
      area('noticeText', 'বিজ্ঞপ্তির লেখা', { max: 2000 }),
    ],
    collections: {
      steps: { label: 'ধাপসমূহ', itemLabel: 'ধাপ', titleField: 'title', orderable: true, maxItems: 12,
        fields: [text('title', 'শিরোনাম', { required: true }), area('text', 'বিবরণ', { max: 1000 })] },
    },
  },
  resorts: {
    label: 'অবকাশ ও আতিথেয়তা',
    fields: [kicker, heading],
    collections: {
      items: { label: 'অবকাশ কেন্দ্র', itemLabel: 'অবকাশ কেন্দ্র', titleField: 'name', orderable: true, maxItems: 20,
        fields: [
          text('name', 'নাম', { required: true }),
          area('description', 'বিবরণ', { max: 2000 }),
          area('booking', 'বুকিং তথ্য', { max: 1000 }),
          images('photos', 'ছবি'),
          bool('visible', 'প্রকাশিত'),
        ] },
    },
  },
  structure: {
    label: 'সাংগঠনিক কাঠামো',
    fields: [kicker, heading],
    collections: {
      modules: { label: 'কার্যমডিউল', itemLabel: 'মডিউল', titleField: 'title', orderable: true, maxItems: 20,
        fields: [text('title', 'শিরোনাম', { required: true }), area('description', 'বিবরণ', { max: 1000 }), text('officer', 'দায়িত্বপ্রাপ্ত কর্মকর্তা (যেমন: ম্যানেজার: নাম)')] },
    },
  },
  notices: {
    label: 'নোটিশ বোর্ড',
    fields: [kicker, heading, area('emptyText', 'কোনো নোটিশ না থাকলে যে লেখা দেখাবে', { max: 1000 })],
    collections: {
      items: { label: 'নোটিশ', itemLabel: 'নোটিশ', titleField: 'title', orderable: false, maxItems: 1000,
        fields: [
          text('title', 'শিরোনাম', { required: true }),
          date('date', 'তারিখ', { required: true }),
          area('body', 'বিস্তারিত', { max: 20000 }),
          attachment('attachment', 'সংযুক্তি (PDF বা ছবি, ঐচ্ছিক)'),
          bool('published', 'প্রকাশিত'),
          meta('createdAt'),
        ] },
    },
  },
  gallery: {
    label: 'গ্যালারি',
    fields: [kicker, heading],
    collections: {
      items: { label: 'ছবি', itemLabel: 'ছবি', titleField: 'caption', orderable: true, maxItems: 300,
        fields: [image('image', 'ছবি', { required: true }), text('caption', 'ক্যাপশন')] },
    },
  },
  contact: {
    label: 'যোগাযোগ',
    fields: [
      kicker, heading,
      area('address', 'ঠিকানা', { required: true, max: 500 }),
      text('copyLabel', '“ঠিকানা কপি” বোতামের লেখা', { max: 60 }),
      text('mapLabel', 'মানচিত্র বোতামের লেখা', { max: 60 }),
      href('mapUrl', 'মানচিত্রের লিংক'),
      text('phoneLabel', 'ফোন — লেবেল', { max: 40 }),
      text('phone', 'ফোন নম্বর', { max: 100 }),
      text('emailLabel', 'ই-মেইল — লেবেল', { max: 40 }),
      { name: 'email', label: 'ই-মেইল', type: 'email', max: 200 },
      text('parentLabel', 'মূল সংস্থা — লেবেল', { max: 40 }),
      text('parentText', 'মূল সংস্থার লিংকের লেখা', { max: 200 }),
      href('parentUrl', 'মূল সংস্থার ওয়েবসাইট'),
      text('hoursLabel', 'অফিস সময় — লেবেল', { max: 40 }),
      text('officeHours', 'অফিস সময়', { max: 300 }),
      bool('formEnabled', 'যোগাযোগ ফর্ম দেখাবে'),
      text('formTitle', 'যোগাযোগ ফর্মের শিরোনাম'),
      area('formIntro', 'যোগাযোগ ফর্মের ভূমিকা', { max: 1000 }),
    ],
  },
  footer: {
    label: 'ফুটার',
    fields: [
      text('title', 'ফুটার শিরোনাম'),
      area('statement', 'বিবৃতি', { max: 500 }),
      bool('showContact', 'ঠিকানা, ফোন ও ই-মেইল দেখাবে'),
      text('quickLinksTitle', 'দ্রুত লিংক — শিরোনাম'),
      text('registrationTitle', 'নিবন্ধন তথ্য — শিরোনাম'),
      text('copyright', 'কপিরাইট লাইন (সাল ও নাম স্বয়ংক্রিয়ভাবে বসবে)'),
    ],
    collections: {
      quickLinks: { label: 'দ্রুত লিংক', itemLabel: 'লিংক', titleField: 'label', orderable: true, maxItems: 20,
        fields: [text('label', 'লেখা', { required: true }), href('href', 'লিংক', { required: true })] },
      registration: { label: 'নিবন্ধন তথ্য (RJSC, ট্রেড লাইসেন্স, ই-টিআইএন ইত্যাদি)', itemLabel: 'নিবন্ধন সারি', titleField: 'label', orderable: true, maxItems: 20,
        fields: [text('label', 'বিষয়', { required: true }), text('value', 'মান', { required: true })] },
    },
  },
};

// Body sections (order + visibility managed by admin). Anchor id = key.
const SECTION_KEYS = ['about', 'leadership', 'services', 'training', 'overseas', 'resort', 'structure', 'notice', 'gallery', 'contact'];
const SECTION_NAMES = {
  about: 'আমাদের সম্পর্কে', leadership: 'নেতৃত্ব', services: 'সেবাসমূহ', training: 'প্রশিক্ষণ ও কোর্স', overseas: 'বৈদেশিক কর্মসংস্থান',
  resort: 'অবকাশ', structure: 'সাংগঠনিক কাঠামো', notice: 'নোটিশ বোর্ড', gallery: 'গ্যালারি', contact: 'যোগাযোগ',
};

// ---- validation ----------------------------------------------------------
const HREF_RE = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:[0-9+\-() ]+|#[A-Za-z0-9_-]*|\/(?!\/)[^\s<>"']*)$/i;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(v) {
  // strip control chars except newline/tab, normalise newlines
  return String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

// Returns { value, error }. `input` is raw (string/array/bool) from a form or an imported document.
function validateField(f, input) {
  const label = f.label;
  switch (f.type) {
    case 'bool':
      return { value: input === true || input === 'on' || input === 'true' || input === '1' || input === 1 };
    case 'meta':
      return { value: typeof input === 'string' ? input.slice(0, 40) : '' };
    case 'image':
    case 'attachment': {
      const v = input == null ? '' : String(input);
      if (v && !isMediaId(v)) return { value: '', error: `${label}: অবৈধ ফাইল আইডি।` };
      if (f.required && !v) return { value: '', error: `${label}: একটি ফাইল আবশ্যক।` };
      return { value: v };
    }
    case 'images': {
      const arr = Array.isArray(input) ? input : (input ? [input] : []);
      if (arr.some((x) => !isMediaId(String(x)))) return { value: [], error: `${label}: অবৈধ ফাইল আইডি।` };
      if (arr.length > f.maxItems) return { value: arr.slice(0, f.maxItems), error: `${label}: সর্বোচ্চ ${f.maxItems}টি ছবি রাখা যাবে।` };
      return { value: arr.map(String) };
    }
    case 'lines':
    case 'paragraphs': {
      let arr;
      if (Array.isArray(input)) arr = input.map((x) => cleanText(x ?? '').trim());
      else {
        const s = cleanText(input ?? '');
        arr = f.type === 'lines' ? s.split('\n') : s.split(/\n\s*\n/);
        arr = arr.map((x) => (f.type === 'lines' ? x.trim() : x.replace(/\s*\n\s*/g, ' ').trim()));
      }
      arr = arr.filter(Boolean);
      if (arr.length > f.maxItems) return { value: arr, error: `${label}: সর্বোচ্চ ${f.maxItems}টি রাখা যাবে।` };
      if (arr.some((x) => x.length > f.max)) return { value: arr, error: `${label}: প্রতিটি সর্বোচ্চ ${f.max} অক্ষর হতে পারবে।` };
      if (f.required && !arr.length) return { value: arr, error: `${label}: পূরণ করা আবশ্যক।` };
      return { value: arr };
    }
    default: {
      if (input != null && typeof input !== 'string' && typeof input !== 'number') return { value: '', error: `${label}: অবৈধ মান।` };
      let v = cleanText(input ?? '');
      v = f.type === 'textarea' ? v.trim() : v.replace(/\s*\n\s*/g, ' ').trim();
      if (f.required && !v) return { value: v, error: `${label}: পূরণ করা আবশ্যক।` };
      if (v.length > (f.max || 300)) return { value: v, error: `${label}: সর্বোচ্চ ${f.max || 300} অক্ষর হতে পারবে।` };
      if (v && f.type === 'href' && !HREF_RE.test(v)) return { value: v, error: `${label}: লিংক অবশ্যই https://, mailto:, tel:, # বা / দিয়ে শুরু হতে হবে।` };
      if (v && f.type === 'email' && !EMAIL_RE.test(v)) return { value: v, error: `${label}: সঠিক ই-মেইল ঠিকানা দিন।` };
      if (f.type === 'date' && v) {
        const d = new Date(v + 'T00:00:00Z');
        if (!DATE_RE.test(v) || Number.isNaN(d.getTime())) return { value: v, error: `${label}: সঠিক তারিখ দিন (YYYY-MM-DD)।` };
      }
      if (f.type === 'select' && v && !f.options.some((o) => o.value === v)) return { value: v, error: `${label}: তালিকা থেকে একটি বেছে নিন।` };
      return { value: v };
    }
  }
}

function validateFields(fields, src) {
  const out = {};
  const errors = [];
  for (const f of fields) {
    const { value, error } = validateField(f, src ? src[f.name] : undefined);
    out[f.name] = value;
    if (error) errors.push(error);
  }
  return { value: out, errors };
}

function validateSections(input) {
  const errors = [];
  const list = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const s of list) {
    if (!s || !SECTION_KEYS.includes(s.key) || seen.has(s.key)) continue;
    seen.add(s.key);
    const label = cleanText(s.navLabel ?? '').trim();
    if (label.length > 60) errors.push(`${SECTION_NAMES[s.key]}: মেনুর লেখা সর্বোচ্চ ৬০ অক্ষর।`);
    out.push({ key: s.key, navLabel: label.slice(0, 60), visible: s.visible !== false, inNav: !!s.inNav && !!label });
  }
  for (const k of SECTION_KEYS) if (!seen.has(k)) out.push({ key: k, navLabel: '', visible: k !== 'gallery', inNav: false });
  return { value: out, errors };
}

// Validate a complete content document (seed or import). Returns { value, errors }.
function validateContent(raw) {
  const errors = [];
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, errors: ['কনটেন্ট অবজেক্ট পাওয়া যায়নি।'] };
  for (const [key, node] of Object.entries(SCHEMA)) {
    const src = raw[key] && typeof raw[key] === 'object' ? raw[key] : {};
    const r = validateFields(node.fields || [], src);
    r.errors.forEach((e) => errors.push(`[${node.label}] ${e}`));
    const obj = r.value;
    for (const [ckey, coll] of Object.entries(node.collections || {})) {
      const arr = Array.isArray(src[ckey]) ? src[ckey] : [];
      if (arr.length > coll.maxItems) errors.push(`[${coll.label}] সর্বোচ্চ ${coll.maxItems}টি আইটেম।`);
      const ids = new Set();
      obj[ckey] = arr.slice(0, coll.maxItems).map((item) => {
        const ir = validateFields(coll.fields, item || {});
        ir.errors.forEach((e) => errors.push(`[${coll.label}] ${e}`));
        let id = item && isId(item.id) ? item.id : newId();
        if (ids.has(id)) id = newId();
        ids.add(id);
        return { id, ...ir.value };
      });
    }
    out[key] = obj;
  }
  const s = validateSections(raw.sections);
  s.errors.forEach((e) => errors.push(e));
  out.sections = s.value;
  out.version = 1;
  return { value: out, errors };
}

// All media ids referenced anywhere in content.
function mediaRefs(content) {
  const refs = new Map(); // id -> [where]
  const add = (id, where) => { if (isMediaId(id)) { if (!refs.has(id)) refs.set(id, []); refs.get(id).push(where); } };
  for (const [key, node] of Object.entries(SCHEMA)) {
    const obj = content[key] || {};
    for (const f of node.fields || []) {
      if (f.type === 'image' || f.type === 'attachment') add(obj[f.name], node.label);
      if (f.type === 'images') (obj[f.name] || []).forEach((id) => add(id, node.label));
    }
    for (const [ckey, coll] of Object.entries(node.collections || {})) {
      for (const item of obj[ckey] || []) {
        for (const f of coll.fields) {
          const where = `${coll.label}: ${item[coll.titleField] || item.id}`;
          if (f.type === 'image' || f.type === 'attachment') add(item[f.name], where);
          if (f.type === 'images') (item[f.name] || []).forEach((id) => add(id, where));
        }
      }
    }
  }
  return refs;
}

module.exports = {
  SCHEMA, SECTION_KEYS, SECTION_NAMES, ICON_OPTIONS,
  validateField, validateFields, validateContent, validateSections, mediaRefs,
  newId, isId, isMediaId, cleanText, EMAIL_RE,
};
