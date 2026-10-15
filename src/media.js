'use strict';

const crypto = require('node:crypto');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALL_TYPES = [...IMAGE_TYPES, 'application/pdf'];
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// Determine the real file type from its first bytes (never trust the browser's mimetype alone).
function sniffType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

function cleanFilename(name, type) {
  let base = String(name || 'file').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120);
  if (!base) base = 'file';
  const ext = EXT[type];
  if (ext && !base.toLowerCase().endsWith('.' + ext)) base += '.' + ext;
  return base;
}

// multer/busboy hands us the multipart filename decoded as latin1; re-decode as UTF-8 (Bangla names).
function decodeName(file) {
  return Buffer.from(String((file && file.originalname) || ''), 'latin1').toString('utf8').slice(0, 120);
}

// Validates an uploaded multer file. Returns { error } or { meta, buffer }.
function prepareUpload(file, { allow = ALL_TYPES, maxBytes = 5 * 1024 * 1024, user = '' } = {}) {
  if (!file || !file.buffer || !file.size) return { error: 'ফাইলটি খালি।' };
  if (file.size > maxBytes) return { error: `ফাইলের আকার সর্বোচ্চ ${Math.round(maxBytes / 1024 / 1024)} MB হতে পারবে।` };
  const type = sniffType(file.buffer);
  if (!type || !allow.includes(type)) { // the sniffed type is authoritative; the browser's mimetype is ignored
    const what = allow.includes('application/pdf') ? 'JPG, PNG, WEBP বা PDF' : 'JPG, PNG বা WEBP';
    return { error: `শুধু ${what} ফাইল আপলোড করা যাবে।` };
  }
  const meta = {
    id: crypto.randomBytes(12).toString('hex'),
    filename: cleanFilename(decodeName(file), type),
    contentType: type,
    size: file.size,
    createdAt: new Date().toISOString(),
    uploadedBy: user,
  };
  return { meta, buffer: file.buffer };
}

module.exports = { IMAGE_TYPES, ALL_TYPES, sniffType, prepareUpload, decodeName };
