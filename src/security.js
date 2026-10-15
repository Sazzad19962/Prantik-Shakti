'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// ---- passwords (scrypt, per-user salt) -----------------------------------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(key, expected);
}

// A fixed dummy hash so unknown usernames take the same time as wrong passwords.
let dummyHash = null;
async function burnPasswordCheck(password) {
  if (!dummyHash) dummyHash = await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummyHash);
}

// ---- tokens & signed cookie values ----------------------------------------
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function sign(value, secret) {
  const mac = crypto.createHmac('sha256', secret).update(String(value)).digest('base64url');
  return `${value}.${mac}`;
}

function unsign(signed, secret) {
  if (typeof signed !== 'string') return null;
  const i = signed.lastIndexOf('.');
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value, secret));
  const got = Buffer.from(signed);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  return value;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ---- simple in-memory fixed-window rate limiter ---------------------------
class RateLimiter {
  constructor({ windowMs, max }) { this.windowMs = windowMs; this.max = max; this.hits = new Map(); }
  _entry(key) {
    const now = Date.now();
    let e = this.hits.get(key);
    if (!e || e.reset <= now) { e = { count: 0, reset: now + this.windowMs }; this.hits.set(key, e); }
    if (this.hits.size > 10000) for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
    return e;
  }
  hit(key) { const e = this._entry(key); e.count++; return e.count <= this.max; }
  blocked(key) { const e = this._entry(key); return e.count >= this.max; }
  retryAfterSec(key) { const e = this.hits.get(key); return e ? Math.max(1, Math.ceil((e.reset - Date.now()) / 1000)) : 0; }
  reset(key) { this.hits.delete(key); }
}

// ---- security headers ------------------------------------------------------
function securityHeaders(production) {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' https://fonts.googleapis.com",
    "script-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
  ].join('; ');
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

module.exports = { hashPassword, verifyPassword, burnPasswordCheck, randomToken, sign, unsign, safeEqual, RateLimiter, securityHeaders };
