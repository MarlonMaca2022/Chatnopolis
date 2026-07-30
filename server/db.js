const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { canonicalNick } = require('./nicks');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'chat.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    username_canon TEXT,      -- canonicalNick(username); toda búsqueda por nombre usa esta
    password_hash TEXT NOT NULL,
    name TEXT,
    email TEXT,
    country TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    is_banned INTEGER NOT NULL DEFAULT 0,
    banned_until TEXT,        -- NULL con is_banned=1 => ban permanente
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
    image_expired INTEGER NOT NULL DEFAULT 0,  -- la foto se borró por TTL; el mensaje queda
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, id);
  CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(sender, recipient, id);

  CREATE TABLE IF NOT EXISTS guest_bans (
    username TEXT PRIMARY KEY,   -- el nick tal como se escribió, para mostrarlo en el panel
    username_canon TEXT,         -- lo que realmente se compara al banear/chequear
    expires_at TEXT,             -- NULL => ban permanente
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Migraciones para bases de datos ya creadas ---
const hasColumn = (table, col) =>
  db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

if (!hasColumn('users', 'banned_until')) db.exec('ALTER TABLE users ADD COLUMN banned_until TEXT');
if (!hasColumn('guest_bans', 'expires_at')) db.exec('ALTER TABLE guest_bans ADD COLUMN expires_at TEXT');
if (!hasColumn('messages', 'image_expired')) {
  db.exec('ALTER TABLE messages ADD COLUMN image_expired INTEGER NOT NULL DEFAULT 0');
}

// Columnas canónicas: se agregan vacías y se rellenan desde el nombre ya guardado.
function backfillCanon(table, key) {
  if (hasColumn(table, 'username_canon')) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN username_canon TEXT`);
  const update = db.prepare(`UPDATE ${table} SET username_canon = ? WHERE ${key} = ?`);
  db.prepare(`SELECT ${key} AS key, username FROM ${table}`)
    .all()
    .forEach((row) => update.run(canonicalNick(row.username), row.key));
}
backfillCanon('users', 'id');
backfillCanon('guest_bans', 'username');

// UNIQUE es la garantía real de que no entren dos nombres que solo difieren en
// mayúsculas o acentos. Si la base ya trae un par así, el índice único no se puede
// crear: avisamos y dejamos uno normal (las búsquedas siguen funcionando; la
// unicidad la sostienen igual los chequeos de /register y del handshake).
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_canon ON users(username_canon)');
} catch {
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_canon ON users(username_canon)');
  console.warn(
    'Aviso: hay usuarios que solo se diferencian por mayúsculas o acentos. ' +
      'Renombrá los duplicados y reiniciá para activar el índice único.'
  );
}
db.exec('CREATE INDEX IF NOT EXISTS idx_guest_bans_canon ON guest_bans(username_canon)');

// --- Seed inicial ---
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
  db.prepare(
    "INSERT INTO users (username, username_canon, password_hash, role) VALUES ('admin', 'admin', ?, 'admin')"
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

// Un ban con fecha ya cumplida deja de contar. Lo evaluamos al leer (sin timers
// ni cron) y de paso limpiamos el registro en ese mismo momento.
const isExpired = (until) => !!until && new Date(until).getTime() <= Date.now();

// --- Users ---
const users = {
  // Búsqueda por nombre SIEMPRE canónica: así "Admin", "ADMIN" y "admin" son el
  // mismo usuario y nadie puede registrar ni usar como nick una variante del
  // nombre de otro. Devuelve la fila con el `username` original para mostrarlo.
  findByNick: (nick) =>
    db.prepare('SELECT * FROM users WHERE username_canon = ?').get(canonicalNick(nick)),
  create: ({ username, passwordHash, name, email, country }) =>
    db.prepare(
      'INSERT INTO users (username, username_canon, password_hash, name, email, country) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, canonicalNick(username), passwordHash, name, email, country),
  all: () =>
    db.prepare('SELECT username, role, is_banned, banned_until, is_muted FROM users').all(),
  setBanned: (username, banned, until = null) =>
    db.prepare('UPDATE users SET is_banned = ?, banned_until = ? WHERE username = ?')
      .run(banned ? 1 : 0, banned ? until : null, username),
  setMuted: (username, muted) =>
    db.prepare('UPDATE users SET is_muted = ? WHERE username = ?').run(muted ? 1 : 0, username),
  toggleMuted: (username) =>
    db.prepare('UPDATE users SET is_muted = 1 - is_muted WHERE username = ?').run(username),

  // { banned, until } — until null en bans permanentes. Vence solo.
  banStatus: (username) => {
    const row = db
      .prepare('SELECT is_banned, banned_until FROM users WHERE username = ?')
      .get(username);
    if (!row || !row.is_banned) return { banned: false, until: null };
    if (isExpired(row.banned_until)) {
      users.setBanned(username, false);
      return { banned: false, until: null };
    }
    return { banned: true, until: row.banned_until || null };
  },
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

// Cuántos mensajes se conservan por sala. Los más viejos se borran al insertar.
const ROOM_HISTORY_LIMIT = Number(process.env.ROOM_HISTORY_LIMIT) || 500;
// No podamos en cada mensaje: dejamos que se acumule este colchón primero.
const PRUNE_SLACK = 50;

const messages = {
  ROOM_HISTORY_LIMIT,

  saveRoom: (room, sender, text, imageUrl) =>
    db.prepare('INSERT INTO messages (room, sender, text, image_url) VALUES (?, ?, ?, ?)')
      .run(room, sender, text ?? null, imageUrl ?? null),
  saveDM: (sender, recipient, text, imageUrl) =>
    db.prepare('INSERT INTO messages (sender, recipient, text, image_url) VALUES (?, ?, ?, ?)')
      .run(sender, recipient, text ?? null, imageUrl ?? null),
  // Por defecto mandamos todo lo que se guarda: lo que retiene la sala es lo que se ve
  roomHistory: (room, limit = ROOM_HISTORY_LIMIT) =>
    db.prepare(`
      SELECT * FROM (
        SELECT sender, text, image_url AS imageUrl, image_expired AS imageExpired,
               created_at AS createdAt, id
        FROM messages WHERE room = ? ORDER BY id DESC LIMIT ?
      ) ORDER BY id ASC
    `).all(room, limit),
  dmHistory: (userA, userB, limit = 50) =>
    db.prepare(`
      SELECT * FROM (
        SELECT sender, recipient, text, image_url AS imageUrl, image_expired AS imageExpired,
               created_at AS createdAt, id
        FROM messages
        WHERE room IS NULL AND (
          (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)
        )
        ORDER BY id DESC LIMIT ?
      ) ORDER BY id ASC
    `).all(userA, userB, userB, userA, limit),

  // Deja como mucho `keep` mensajes en la sala. Devuelve las URLs de las fotos que
  // se fueron con los mensajes borrados para que el llamador elimine los archivos.
  pruneRoom: (room, keep = ROOM_HISTORY_LIMIT) => {
    const total = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE room = ?').get(room).n;
    if (total <= keep + PRUNE_SLACK) return [];

    // El id más viejo que se conserva; todo lo anterior se va.
    const cutoff = db
      .prepare('SELECT id FROM messages WHERE room = ? ORDER BY id DESC LIMIT 1 OFFSET ?')
      .get(room, keep - 1);
    if (!cutoff) return [];

    const orphans = db
      .prepare('SELECT image_url FROM messages WHERE room = ? AND id < ? AND image_url IS NOT NULL')
      .all(room, cutoff.id)
      .map((r) => r.image_url);
    db.prepare('DELETE FROM messages WHERE room = ? AND id < ?').run(room, cutoff.id);
    return orphans;
  },

  // Salas que tienen mensajes (incluye salas ya borradas de `rooms`)
  roomsWithMessages: () =>
    db.prepare('SELECT DISTINCT room FROM messages WHERE room IS NOT NULL').all().map((r) => r.room),

  // Marca como vencidas las fotos anteriores al corte y devuelve sus URLs.
  // El mensaje sobrevive con image_expired = 1 (el cliente muestra un placeholder).
  expireImages: (cutoff) => {
    const rows = db
      .prepare('SELECT image_url FROM messages WHERE image_url IS NOT NULL AND created_at <= ?')
      .all(cutoff);
    if (rows.length === 0) return [];
    db.prepare(
      'UPDATE messages SET image_url = NULL, image_expired = 1 WHERE image_url IS NOT NULL AND created_at <= ?'
    ).run(cutoff);
    return rows.map((r) => r.image_url);
  },

  // URLs de fotos que algún mensaje todavía referencia (para detectar huérfanos en disco)
  referencedImages: () =>
    db.prepare('SELECT DISTINCT image_url FROM messages WHERE image_url IS NOT NULL')
      .all()
      .map((r) => r.image_url),
};

// --- Guest bans (por nick, los invitados no existen en `users`) ---
const guestBans = {
  // { banned, until } — until null en bans permanentes. Vence solo.
  // Compara por canónica: sin eso, un baneado vuelve al instante escribiendo su
  // mismo nick con una tilde o una mayúscula distinta.
  status: (username) => {
    const row = db
      .prepare('SELECT expires_at FROM guest_bans WHERE username_canon = ?')
      .get(canonicalNick(username));
    if (!row) return { banned: false, until: null };
    if (isExpired(row.expires_at)) {
      guestBans.remove(username);
      return { banned: false, until: null };
    }
    return { banned: true, until: row.expires_at || null };
  },
  has: (username) => guestBans.status(username).banned,
  // Borramos por canónica antes de insertar para que rebanear con otra duración
  // pise la anterior aunque el nick venga escrito distinto.
  add: (username, expiresAt = null) => {
    guestBans.remove(username);
    db.prepare(
      'INSERT INTO guest_bans (username, username_canon, expires_at) VALUES (?, ?, ?)'
    ).run(username, canonicalNick(username), expiresAt);
  },
  remove: (username) =>
    db.prepare('DELETE FROM guest_bans WHERE username_canon = ?').run(canonicalNick(username)),
  all: () =>
    db
      .prepare('SELECT username, expires_at AS expiresAt FROM guest_bans ORDER BY username')
      .all()
      .filter((row) => {
        if (!isExpired(row.expiresAt)) return true;
        guestBans.remove(row.username);
        return false;
      }),
};

module.exports = { db, users, rooms, messages, guestBans };
