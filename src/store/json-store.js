'use strict';

// Local JSON-file backend (development / single-machine use).
//   <dir>/content.json   site content
//   <dir>/state.json     users, sessions, enquiries, audit log
//   <dir>/uploads/<id>   uploaded file bytes, <id>.json = metadata

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const AUDIT_MAX = 2000;

class JsonStore {
  constructor(dir) {
    this.kind = 'json';
    this.dir = path.resolve(dir);
    this.uploads = path.join(this.dir, 'uploads');
    this.contentFile = path.join(this.dir, 'content.json');
    this.stateFile = path.join(this.dir, 'state.json');
    this.content = null;
    this.state = null;
    this.queue = Promise.resolve();
  }

  async init() {
    await fsp.mkdir(this.uploads, { recursive: true });
    this.content = await readJson(this.contentFile, null);
    this.state = await readJson(this.stateFile, {});
    for (const k of ['users', 'sessions', 'enquiries', 'audit']) if (!Array.isArray(this.state[k])) this.state[k] = [];
  }

  async close() { await this.queue; }

  // serialise writes so concurrent requests never interleave file writes
  _write(file, data) {
    const run = () => writeJsonAtomic(file, data);
    this.queue = this.queue.then(run, run);
    return this.queue;
  }
  _saveState() { return this._write(this.stateFile, this.state); }

  // ---- content
  async getContent() { return this.content ? structuredClone(this.content) : null; }
  async saveContent(content) {
    this.content = structuredClone(content);
    await this._write(this.contentFile, this.content);
  }

  // ---- users
  async listUsers() { return this.state.users.map((u) => ({ ...u })); }
  async countUsers() { return this.state.users.length; }
  async findUserByName(username) {
    const u = this.state.users.find((x) => x.username === username);
    return u ? { ...u } : null;
  }
  async getUser(id) {
    const u = this.state.users.find((x) => x.id === id);
    return u ? { ...u } : null;
  }
  async addUser(user) { this.state.users.push({ ...user }); await this._saveState(); }
  async updateUser(id, patch) {
    const u = this.state.users.find((x) => x.id === id);
    if (!u) return false;
    Object.assign(u, patch);
    await this._saveState();
    return true;
  }
  async deleteUser(id) {
    const before = this.state.users.length;
    this.state.users = this.state.users.filter((x) => x.id !== id);
    this.state.sessions = this.state.sessions.filter((s) => s.userId !== id);
    await this._saveState();
    return this.state.users.length !== before;
  }

  // ---- sessions
  async createSession(s) {
    const now = Date.now();
    this.state.sessions = this.state.sessions.filter((x) => x.expiresAt > now);
    this.state.sessions.push({ ...s });
    await this._saveState();
  }
  async getSession(id) {
    const s = this.state.sessions.find((x) => x.id === id);
    if (!s || s.expiresAt <= Date.now()) return null;
    return { ...s };
  }
  async deleteSession(id) {
    this.state.sessions = this.state.sessions.filter((x) => x.id !== id);
    await this._saveState();
  }
  async deleteUserSessions(userId, exceptId) {
    this.state.sessions = this.state.sessions.filter((x) => x.userId !== userId || x.id === exceptId);
    await this._saveState();
  }

  // ---- enquiries
  async addEnquiry(e) { this.state.enquiries.push({ ...e }); await this._saveState(); }
  async listEnquiries() { return [...this.state.enquiries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((e) => ({ ...e })); }
  async countUnreadEnquiries() { return this.state.enquiries.filter((e) => !e.read).length; }
  async updateEnquiry(id, patch) {
    const e = this.state.enquiries.find((x) => x.id === id);
    if (!e) return false;
    Object.assign(e, patch);
    await this._saveState();
    return true;
  }
  async deleteEnquiry(id) {
    const before = this.state.enquiries.length;
    this.state.enquiries = this.state.enquiries.filter((x) => x.id !== id);
    await this._saveState();
    return before !== this.state.enquiries.length;
  }

  // ---- audit
  async addAudit(entry) {
    this.state.audit.push({ ...entry });
    if (this.state.audit.length > AUDIT_MAX) this.state.audit = this.state.audit.slice(-AUDIT_MAX);
    await this._saveState();
  }
  async listAudit(limit = 300) { return this.state.audit.slice(-limit).reverse().map((a) => ({ ...a })); }

  // ---- media
  _mediaPath(id) { return path.join(this.uploads, id); }
  async putMedia(meta, buffer) {
    await fsp.writeFile(this._mediaPath(meta.id), buffer);
    await writeJsonAtomic(this._mediaPath(meta.id) + '.json', meta);
  }
  async getMediaMeta(id) { return readJson(this._mediaPath(id) + '.json', null); }
  async getMedia(id) {
    const meta = await this.getMediaMeta(id);
    if (!meta) return null;
    try { return { meta, data: await fsp.readFile(this._mediaPath(id)) }; } catch { return null; }
  }
  async listMedia() {
    const names = await fsp.readdir(this.uploads).catch(() => []);
    const metas = [];
    for (const n of names) if (n.endsWith('.json')) { const m = await readJson(path.join(this.uploads, n), null); if (m) metas.push(m); }
    return metas.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  async deleteMedia(id) {
    const meta = await this.getMediaMeta(id);
    await fsp.rm(this._mediaPath(id), { force: true });
    await fsp.rm(this._mediaPath(id) + '.json', { force: true });
    return !!meta;
  }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`Could not read ${file}: ${e.message}`);
  }
}

async function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}

module.exports = { JsonStore, readJsonSync: (f) => JSON.parse(fs.readFileSync(f, 'utf8')) };
