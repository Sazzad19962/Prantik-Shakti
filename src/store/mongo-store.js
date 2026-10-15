'use strict';

// MongoDB backend (production: Render + MongoDB Atlas).
// Collections: content (single doc _id "site"), users, sessions (TTL), enquiries, audit, media (binary docs <= 5 MB).

const { MongoClient, Binary } = require('mongodb');

const AUDIT_MAX = 5000;

class MongoStore {
  constructor(uri, dbName) {
    this.kind = 'mongodb';
    this.uri = uri;
    this.dbName = dbName;
    this.client = null;
    this.db = null;
  }

  async init() {
    this.client = new MongoClient(this.uri, { serverSelectionTimeoutMS: 15000 });
    await this.client.connect();
    this.db = this.client.db(this.dbName || dbNameFromUri(this.uri) || 'prantik_shakti');
    this.c = {
      content: this.db.collection('content'),
      users: this.db.collection('users'),
      sessions: this.db.collection('sessions'),
      enquiries: this.db.collection('enquiries'),
      audit: this.db.collection('audit'),
      media: this.db.collection('media'),
    };
    await Promise.all([
      this.c.users.createIndex({ username: 1 }, { unique: true }),
      this.c.sessions.createIndex({ expiresAtDate: 1 }, { expireAfterSeconds: 0 }),
      this.c.sessions.createIndex({ userId: 1 }),
      this.c.enquiries.createIndex({ createdAt: -1 }),
      this.c.audit.createIndex({ at: -1 }),
      this.c.media.createIndex({ createdAt: -1 }),
    ]);
  }

  async close() { if (this.client) await this.client.close(); }

  // ---- content
  async getContent() {
    const doc = await this.c.content.findOne({ _id: 'site' });
    return doc ? doc.content : null;
  }
  async saveContent(content) {
    await this.c.content.replaceOne({ _id: 'site' }, { _id: 'site', content, updatedAt: new Date().toISOString() }, { upsert: true });
  }

  // ---- users
  async listUsers() { return (await this.c.users.find({}).sort({ createdAt: 1 }).toArray()).map(strip); }
  async countUsers() { return this.c.users.countDocuments({}); }
  async findUserByName(username) { return strip(await this.c.users.findOne({ username })); }
  async getUser(id) { return strip(await this.c.users.findOne({ _id: id })); }
  async addUser(user) { await this.c.users.insertOne({ _id: user.id, ...user }); }
  async updateUser(id, patch) { return (await this.c.users.updateOne({ _id: id }, { $set: patch })).matchedCount > 0; }
  async deleteUser(id) {
    await this.c.sessions.deleteMany({ userId: id });
    return (await this.c.users.deleteOne({ _id: id })).deletedCount > 0;
  }

  // ---- sessions
  async createSession(s) { await this.c.sessions.insertOne({ _id: s.id, ...s, expiresAtDate: new Date(s.expiresAt) }); }
  async getSession(id) {
    const s = await this.c.sessions.findOne({ _id: id });
    if (!s || s.expiresAt <= Date.now()) return null;
    const out = strip(s); delete out.expiresAtDate; return out;
  }
  async deleteSession(id) { await this.c.sessions.deleteOne({ _id: id }); }
  async deleteUserSessions(userId, exceptId) { await this.c.sessions.deleteMany({ userId, _id: { $ne: exceptId || '' } }); }

  // ---- enquiries
  async addEnquiry(e) { await this.c.enquiries.insertOne({ _id: e.id, ...e }); }
  async listEnquiries() { return (await this.c.enquiries.find({}).sort({ createdAt: -1 }).limit(2000).toArray()).map(strip); }
  async countUnreadEnquiries() { return this.c.enquiries.countDocuments({ read: { $ne: true } }); }
  async updateEnquiry(id, patch) { return (await this.c.enquiries.updateOne({ _id: id }, { $set: patch })).matchedCount > 0; }
  async deleteEnquiry(id) { return (await this.c.enquiries.deleteOne({ _id: id })).deletedCount > 0; }

  // ---- audit
  async addAudit(entry) {
    await this.c.audit.insertOne({ _id: entry.id, ...entry });
    if (Math.random() < 0.02) { // occasional trim
      const old = await this.c.audit.find({}).sort({ at: -1 }).skip(AUDIT_MAX).limit(1).toArray();
      if (old[0]) await this.c.audit.deleteMany({ at: { $lte: old[0].at } });
    }
  }
  async listAudit(limit = 300) { return (await this.c.audit.find({}).sort({ at: -1 }).limit(limit).toArray()).map(strip); }

  // ---- media
  async putMedia(meta, buffer) { await this.c.media.insertOne({ _id: meta.id, ...meta, data: new Binary(buffer) }); }
  async getMediaMeta(id) { return strip(await this.c.media.findOne({ _id: id }, { projection: { data: 0 } })); }
  async getMedia(id) {
    const doc = await this.c.media.findOne({ _id: id });
    if (!doc) return null;
    const data = Buffer.from(doc.data.read(0, doc.data.length()));
    delete doc.data;
    return { meta: strip(doc), data };
  }
  async listMedia() { return (await this.c.media.find({}, { projection: { data: 0 } }).sort({ createdAt: -1 }).toArray()).map(strip); }
  async deleteMedia(id) { return (await this.c.media.deleteOne({ _id: id })).deletedCount > 0; }
}

function dbNameFromUri(uri) {
  const m = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/.exec(uri);
  return m ? decodeURIComponent(m[1]) : '';
}

function strip(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: rest.id || _id, ...rest };
}

module.exports = { MongoStore };
