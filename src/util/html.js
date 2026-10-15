'use strict';

// Tiny, auto-escaping HTML template helper.
// Every interpolated value is HTML-escaped unless it is a SafeHtml instance
// (produced by html`` itself or by raw() for trusted, server-authored markup).

class SafeHtml {
  constructor(value) { this.value = String(value); }
  toString() { return this.value; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

function escapeHtml(value) {
  if (value === null || value === undefined || value === false) return '';
  return String(value).replace(/[&<>"'`]/g, (c) => ESC[c]);
}

function render(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(value);
}

function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

// Only for markup authored in this codebase (icons, constant snippets). Never for user input.
function raw(value) { return new SafeHtml(value); }

// Escape text and turn newlines into <br>.
function nl2br(text) {
  return raw(escapeHtml(text || '').replace(/\r?\n/g, '<br>'));
}

// Only allow safe link targets; anything else becomes '#'.
function safeHref(href) {
  const v = String(href || '').trim();
  if (!v) return '#';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v;
  if (/^[#/](?!\/)/.test(v)) return v; // "#anchor" or "/path" but not protocol-relative "//"
  return '#';
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function bnDigits(value) {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[d]);
}

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
function bnDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return `${bnDigits(Number(m[3]))} ${BN_MONTHS[Number(m[2]) - 1] || ''} ${bnDigits(m[1])}`;
}

function bnDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Bangladesh time (UTC+6, no DST)
  const t = new Date(d.getTime() + 6 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  return `${bnDate(day)}, ${bnDigits(pad(t.getUTCHours()))}:${bnDigits(pad(t.getUTCMinutes()))}`;
}

function bnSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return bnDigits((n / 1024 / 1024).toFixed(1)) + ' MB';
  return bnDigits(Math.max(1, Math.round(n / 1024))) + ' KB';
}

module.exports = { html, raw, escapeHtml, nl2br, safeHref, bnDigits, bnDate, bnDateTime, bnSize, SafeHtml };
