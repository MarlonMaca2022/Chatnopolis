const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'chat.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    email TEXT,
    country TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    is_banned INTEGER NOT NULL DEFAULT 0,
    is_muted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT,                -- NULL para mensajes privados
    sender TEXT NOT NULL,
    recipient TEXT,           -- NULL para mensajes de sala
    text TEXT,
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, id);
  CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(sender, recipient, id);

  CREATE TABLE IF NOT EXISTS guest_bans (
    username TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Seed inicial ---
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')"
  ).run(hash);
  console.log('Usuario admin creado (cambia la contraseña en producción con ADMIN_PASSWORD)');
}

const roomCount = db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n;
if (roomCount === 0) {
  const insert = db.prepare('INSERT INTO rooms (id, name) VALUES (?, ?)');
  [
    ['general', 'General'],
    ['tecnologia', 'Tecnología'],
    ['musica', 'Música'],
    ['cine', 'Cine y TV'],
  ].forEach(([id, name]) => insert.run(id, name));
}

// --- Users ---
const users = {
  findByUsername: (username) =>
    db.prepare('SELECT * FROM users WHERE username = ?').get(username),
  create: ({ username, passwordHash, name, email, country }) =>
    db.prepare(
      'INSERT INTO users (username, password_hash, name, email, country) VALUES (?, ?, ?, ?, ?)'
    ).run(username, passwordHash, name, email, country),
  all: () =>
    db.prepare('SELECT username, role, is_banned, is_muted FROM users').all(),
  setBanned: (username, banned) =>
    db.prepare('UPDATE users SET is_banned = ? WHERE username = ?').run(banned ? 1 : 0, username),
  toggleMuted: (username) =>
    db.prepare('UPDATE users SET is_muted = 1 - is_muted WHERE username = ?').run(username),
};

// --- Rooms ---
const rooms = {
  all: () => db.prepare('SELECT id, name, created_by AS createdBy FROM rooms').all(),
  find: (id) => db.prepare('SELECT * FROM rooms WHERE id = ?').get(id),
  create: (id, name, createdBy) =>
    db.prepare('INSERT INTO rooms (id, name, created_by) VALUES (?, ?, ?)').run(id, name, createdBy),
  remove: (id) => db.prepare('DELETE FROM rooms WHERE id = ?').run(id),
};

// --- Messages ---
const messages = {
  saveRoom: (room, sender, text, imageUrl) =>
    db.prepare('INSERT INTO messages (room, sender, text, image_url) VALUES (?, ?, ?, ?)')
      .run(room, sender, text ?? null, imageUrl ?? null),
  saveDM: (sender, recipient, text, imageUrl) =>
    db.prepare('INSERT INTO messages (sender, recipient, text, image_url) VALUES (?, ?, ?, ?)')
      .run(sender, recipient, text ?? null, imageUrl ?? null),
  roomHistory: (room, limit = 50) =>
    db.prepare(`
      SELECT * FROM (
        SELECT sender, text, image_url AS imageUrl, created_at AS createdAt, id
        FROM messages WHERE room = ? ORDER BY id DESC LIMIT ?
      ) ORDER BY id ASC
    `).all(room, limit),
  dmHistory: (userA, userB, limit = 50) =>
    db.prepare(`
      SELECT * FROM (
        SELECT sender, recipient, text, image_url AS imageUrl, created_at AS createdAt, id
        FROM messages
        WHERE room IS NULL AND (
          (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)
        )
        ORDER BY id DESC LIMIT ?
      ) ORDER BY id ASC
    `).all(userA, userB, userB, userA, limit),
};

// --- Guest bans ---
const guestBans = {
  has: (username) =>
    !!db.prepare('SELECT 1 FROM guest_bans WHERE username = ?').get(username),
  add: (username) =>
    db.prepare('INSERT OR IGNORE INTO guest_bans (username) VALUES (?)').run(username),
};

module.exports = { db, users, rooms, messages, guestBans };
