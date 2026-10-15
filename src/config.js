'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

// Reads configuration from environment variables. Returns { config, problems, warnings }.
function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const warnings = [];
  const problems = [];

  let sessionSecret = env.SESSION_SECRET || '';
  if (!sessionSecret) {
    if (production) problems.push('SESSION_SECRET সেট করা নেই (production-এ আবশ্যক)।');
    else warnings.push('SESSION_SECRET সেট করা নেই — অস্থায়ী গোপন কী ব্যবহার করা হচ্ছে; সার্ভার রিস্টার্টে লগইন বাতিল হবে।');
    sessionSecret = crypto.randomBytes(32).toString('hex');
  } else if (sessionSecret.length < 32) {
    warnings.push('SESSION_SECRET কমপক্ষে ৩২ অক্ষরের হওয়া উচিত।');
  }

  const adminUsername = (env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(adminUsername)) problems.push('ADMIN_USERNAME ৩–৪০ অক্ষরের হতে হবে (a-z, 0-9, . _ -)।');
  let adminPassword = env.ADMIN_PASSWORD || '';
  let usingDefaultPassword = false;
  if (adminPassword && adminPassword.length < 10) warnings.push('ADMIN_PASSWORD অন্তত ১০ অক্ষরের (ভালো হয় ১২+) হওয়া উচিত।');
  if (!adminPassword && !production) {
    adminPassword = 'admin123';
    usingDefaultPassword = true;
    warnings.push('ADMIN_PASSWORD সেট করা নেই — ডেভেলপমেন্ট ডিফল্ট admin / admin123 ব্যবহার হচ্ছে। প্রকাশের আগে অবশ্যই বদলান।');
  }

  if (production && !env.MONGODB_URI) {
    warnings.push('MONGODB_URI সেট করা নেই — লোকাল JSON ফাইলে ডেটা রাখা হচ্ছে। Render-এর মতো হোস্টে রিডিপ্লয়/রিস্টার্টে সব পরিবর্তন ও আপলোড মুছে যেতে পারে!');
  }

  return {
    config: {
      production,
      port: Number(env.PORT) || 3000,
      mongoUri: env.MONGODB_URI || '',
      mongoDb: env.MONGODB_DB || '',
      dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(__dirname, '..', 'data'),
      seedFile: env.SEED_FILE ? path.resolve(env.SEED_FILE) : path.join(__dirname, '..', 'data', 'seed.json'),
      sessionSecret,
      sessionTtlMs: (Number(env.SESSION_TTL_HOURS) || 12) * 3600 * 1000,
      adminUsername,
      adminPassword,
      adminResetPassword: env.ADMIN_RESET_PASSWORD === '1' || env.ADMIN_RESET_PASSWORD === 'true',
      usingDefaultPassword,
      trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY : (production ? 1 : false),
      maxUploadBytes: 5 * 1024 * 1024,
    },
    problems,
    warnings,
  };
}

module.exports = { loadConfig };
