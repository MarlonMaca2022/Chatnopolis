const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { canonicalNick } = require('./nicks');
const { TERMS_VERSION } = require('./legal');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'chat.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  -- Por conexión, no se guarda en el archivo: sin esto SQLite ignora los
  -- ON DELETE CASCADE de message_reactions.
  PRAGMA foreign_keys = ON;

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
    accepted_terms_at TEXT,   -- cuándo aceptó; NULL => nunca aceptó (cuenta vieja)
    terms_version TEXT,       -- qué versión aceptó; distinta de TERMS_VERSION => re-aceptar
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

  -- Una fila por persona y emoji. Se van solas con el mensaje (poda, borrado del
  -- admin), así que ningún camino que borre mensajes tiene que acordarse de ellas.
  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    username_canon TEXT NOT NULL,  -- identidad: un toggle por persona aunque cambie mayúsculas
    username TEXT NOT NULL,        -- para mostrar quién reaccionó
    emoji TEXT NOT NULL,
    PRIMARY KEY (message_id, username_canon, emoji)
  );

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
// Se agregan vacías a propósito: una cuenta que ya existía nunca aceptó estos
// términos, y NULL es exactamente eso. Al entrar se le piden (ver routes.js).
if (!hasColumn('users', 'accepted_terms_at')) db.exec('ALTER TABLE users ADD COLUMN accepted_terms_at TEXT');
if (!hasColumn('users', 'terms_version')) db.exec('ALTER TABLE users ADD COLUMN terms_version TEXT');
// Verificación en dos pasos (server/totp.js). totp_secret NULL => desactivada.
// totp_pending es el secreto recién generado mientras se escanea el QR: no protege
// nada hasta que se confirma con un código, así un QR abandonado no deja la cuenta
// a medio configurar. totp_recovery es un JSON con los hashes de los códigos que
// quedan sin usar.
if (!hasColumn('users', 'totp_secret')) {
  db.exec(`
    ALTER TABLE users ADD COLUMN totp_secret TEXT;
    ALTER TABLE users ADD COLUMN totp_pending TEXT;
    ALTER TABLE users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT -1;
    ALTER TABLE users ADD COLUMN totp_recovery TEXT;
  `);
}
// Versión de sesión: viaja dentro de cada token (`sv`) y el token solo vale mientras
// coincida con la de la base. Subirla invalida en el acto todas las sesiones de la
// cuenta, que es lo único que permite cortar un token robado antes de que venza.
if (!hasColumn('users', 'session_version')) {
  db.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
}
// Respuestas: el id del mensaje citado. Sin FK a propósito: si el original se borra
// (poda o admin), la respuesta queda y muestra "Mensaje eliminado".
if (!hasColumn('messages', 'reply_to')) db.exec('ALTER TABLE messages ADD COLUMN reply_to INTEGER');
// Género (server/profile.js). Las cuentas anteriores quedan en NULL: no se les
// inventa uno, lo eligen ellas desde su perfil.
if (!hasColumn('users', 'gender')) db.exec('ALTER TABLE users ADD COLUMN gender TEXT');
// Foto de perfil: una URL /uploads/... como las de los mensajes, pero sin TTL. El
// barrido de huérfanos la cuenta como referenciada (users.avatarUrls).
if (!hasColumn('users', 'avatar_url')) db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');

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
  // "admin" es el primer nombre que prueba un bot y avisa a todos qué cuenta atacar:
  // en producción conviene uno propio con ADMIN_USERNAME. Mismo formato que el registro.
  let adminName = (process.env.ADMIN_USERNAME || 'admin').trim();
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(adminName)) {
    console.warn(`Aviso: ADMIN_USERNAME "${adminName}" no es válido (3-20 letras, números, _ o -). Se usa "admin".`);
    adminName = 'admin';
  }
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
  // El admin del seed nace con los términos aceptados: es quien monta el sitio, y
  // así un problema en el flujo de re-aceptación no lo deja afuera de su panel.
  db.prepare(
    `INSERT INTO users (username, username_canon, password_hash, role, accepted_terms_at, terms_version)
     VALUES (?, ?, ?, 'admin', datetime('now'), ?)`
  ).run(adminName, canonicalNick(adminName), hash, TERMS_VERSION);
  console.log(`Usuario admin "${adminName}" creado (en producción definí ADMIN_PASSWORD y ADMIN_USERNAME)`);
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
  create: ({ username, passwordHash, name, email, country, gender, termsVersion }) =>
    db.prepare(
      `INSERT INTO users (username, username_canon, password_hash, name, email, country, gender, accepted_terms_at, terms_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
    ).run(username, canonicalNick(username), passwordHash, name, email, country, gender, termsVersion),

  // Por canónica, como todo lo que busca por nombre: "María" y "maria" son la
  // misma cuenta y la aceptación tiene que caer en la fila correcta.
  acceptTerms: (username, version) =>
    db.prepare(
      "UPDATE users SET accepted_terms_at = datetime('now'), terms_version = ? WHERE username_canon = ?"
    ).run(version, canonicalNick(username)),
  all: () =>
    db.prepare('SELECT username, role, is_banned, banned_until, is_muted FROM users').all(),
  setBanned: (username, banned, until = null) =>
    db.prepare('UPDATE users SET is_banned = ?, banned_until = ? WHERE username = ?')
      .run(banned ? 1 : 0, banned ? until : null, username),
  setMuted: (username, muted) =>
    db.prepare('UPDATE users SET is_muted = ? WHERE username = ?').run(muted ? 1 : 0, username),
  toggleMuted: (username) =>
    db.prepare('UPDATE users SET is_muted = 1 - is_muted WHERE username = ?').run(username),

  // --- Verificación en dos pasos ---
  setTotpPending: (username, secret) =>
    db.prepare('UPDATE users SET totp_pending = ? WHERE username = ?').run(secret, username),
  enableTotp: (username, secret, step, recoveryHashes) =>
    db.prepare(
      `UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_last_step = ?, totp_recovery = ?
       WHERE username = ?`
    ).run(secret, step, JSON.stringify(recoveryHashes), username),
  disableTotp: (username) =>
    db.prepare(
      `UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_last_step = -1, totp_recovery = NULL
       WHERE username = ?`
    ).run(username),
  // El paso del último código aceptado: el próximo tiene que ser posterior (ver totp.verify)
  setTotpStep: (username, step) =>
    db.prepare('UPDATE users SET totp_last_step = ? WHERE username = ?').run(step, username),
  recoveryHashes: (user) => (user.totp_recovery ? JSON.parse(user.totp_recovery) : []),
  // Consume un código de recuperación: true si estaba sin usar y ya no sirve más.
  useRecoveryCode: (user, hash) => {
    const left = users.recoveryHashes(user);
    if (!left.includes(hash)) return false;
    db.prepare('UPDATE users SET totp_recovery = ? WHERE username = ?')
      .run(JSON.stringify(left.filter((h) => h !== hash)), user.username);
    return true;
  },

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

  // --- Perfil ---
  setGender: (username, gender) =>
    db.prepare('UPDATE users SET gender = ? WHERE username = ?').run(gender, username),
  // Devuelve la URL anterior para que quien llama borre ese archivo
  setAvatar: (username, url) => {
    const previous = db.prepare('SELECT avatar_url FROM users WHERE username = ?').get(username)?.avatar_url;
    db.prepare('UPDATE users SET avatar_url = ? WHERE username = ?').run(url, username);
    return previous || null;
  },
  avatarUrls: () =>
    db.prepare('SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL').all().map((r) => r.avatar_url),

  // Quien la llame tiene que cerrar las sesiones de la cuenta (revokeSessions):
  // cambiar la contraseña sin echar a quien ya entró no protege de nada.
  setPassword: (username, passwordHash) =>
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(passwordHash, username),

  // Invalida todos los tokens firmados hasta ahora. Devuelve la versión nueva, que es
  // la que tiene que llevar cualquier token que se firme después.
  bumpSessionVersion: (username) =>
    db.prepare(
      'UPDATE users SET session_version = session_version + 1 WHERE username = ? RETURNING session_version'
    ).get(username).session_version,
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
// Cuántos privados se conservan por conversación. Los DM no tienen sala, así que
// no los alcanza la poda de arriba: sin este tope la tabla `messages` es el único
// lugar de la app donde se puede escribir sin ningún límite. `dmHistory` manda 50
// y no hay paginación en la UI, así que 500 es de sobra.
const DM_PAIR_LIMIT = Number(process.env.DM_PAIR_LIMIT) || 500;

// Columnas de los historiales: el mensaje (m), la foto de perfil actual de quien lo
// mandó (u; los invitados no tienen fila) y, si es una respuesta, lo que hace falta
// del citado (p) para mostrar la cita. reply_to con p.id NULL = el citado ya no existe.
const HISTORY_COLUMNS = `
  m.id, m.sender, m.recipient, m.text, m.image_url AS imageUrl, m.image_expired AS imageExpired,
  m.created_at AS createdAt, m.reply_to AS replyToId, u.avatar_url AS avatarUrl,
  p.id AS replyFoundId, p.sender AS replySender, p.text AS replyText,
  (p.image_url IS NOT NULL OR p.image_expired = 1) AS replyHasPhoto
`;
const HISTORY_JOINS = `
  FROM messages m
  LEFT JOIN users u ON u.username = m.sender
  LEFT JOIN messages p ON p.id = m.reply_to
`;

const messages = {
  ROOM_HISTORY_LIMIT,
  DM_PAIR_LIMIT,

  // Los dos devuelven el id del mensaje nuevo: viaja con él para poder reaccionar,
  // responder o borrarlo.
  saveRoom: (room, sender, text, imageUrl, replyTo = null) =>
    Number(
      db.prepare('INSERT INTO messages (room, sender, text, image_url, reply_to) VALUES (?, ?, ?, ?, ?)')
        .run(room, sender, text ?? null, imageUrl ?? null, replyTo).lastInsertRowid
    ),
  saveDM: (sender, recipient, text, imageUrl, replyTo = null) =>
    Number(
      db.prepare('INSERT INTO messages (sender, recipient, text, image_url, reply_to) VALUES (?, ?, ?, ?, ?)')
        .run(sender, recipient, text ?? null, imageUrl ?? null, replyTo).lastInsertRowid
    ),
  // Por defecto mandamos todo lo que se guarda: lo que retiene la sala es lo que se ve
  roomHistory: (room, limit = ROOM_HISTORY_LIMIT) =>
    db.prepare(`
      SELECT * FROM (
        SELECT ${HISTORY_COLUMNS}
        ${HISTORY_JOINS}
        WHERE m.room = ? ORDER BY m.id DESC LIMIT ?
      ) ORDER BY id ASC
    `).all(room, limit),
  dmHistory: (userA, userB, limit = 50) =>
    db.prepare(`
      SELECT * FROM (
        SELECT ${HISTORY_COLUMNS}
        ${HISTORY_JOINS}
        WHERE m.room IS NULL AND (
          (m.sender = ? AND m.recipient = ?) OR (m.sender = ? AND m.recipient = ?)
        )
        ORDER BY m.id DESC LIMIT ?
      ) ORDER BY id ASC
    `).all(userA, userB, userB, userA, limit),

  find: (id) => db.prepare('SELECT * FROM messages WHERE id = ?').get(id),
  // El id más alto hasta ahora: marca desde dónde ve privados la sesión de un invitado
  lastId: () => db.prepare('SELECT MAX(id) AS id FROM messages').get().id ?? 0,

  // El admin borra un mensaje de sala. Devuelve la sala, o null si no existía o era
  // un privado (los privados no se moderan así: el admin no los ve).
  removeRoomMessage: (id) =>
    db.prepare('DELETE FROM messages WHERE id = ? AND room IS NOT NULL RETURNING room').get(id)?.room ??
    null,

  // { [messageId]: { emoji: [usernames] } } para un lote de mensajes, en una consulta
  reactionsFor: (ids) => {
    const result = {};
    if (ids.length === 0) return result;
    const rows = db
      .prepare(
        `SELECT message_id, username, emoji FROM message_reactions
         WHERE message_id IN (${ids.map(() => '?').join(',')}) ORDER BY rowid`
      )
      .all(...ids);
    for (const { message_id, username, emoji } of rows) {
      ((result[message_id] ||= {})[emoji] ||= []).push(username);
    }
    return result;
  },
  // Pone o saca la reacción y devuelve cómo quedaron las del mensaje
  toggleReaction: (id, canon, username, emoji) => {
    const removed = db
      .prepare('DELETE FROM message_reactions WHERE message_id = ? AND username_canon = ? AND emoji = ?')
      .run(id, canon, emoji).changes;
    if (!removed) {
      db.prepare(
        'INSERT INTO message_reactions (message_id, username_canon, username, emoji) VALUES (?, ?, ?, ?)'
      ).run(id, canon, username, emoji);
    }
    return messages.reactionsFor([id])[id] || {};
  },

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

  // Los dos frenos de los privados. Van en el barrido de cleanup.js y no en el
  // camino de cada mensaje: cuestan un recorrido de la tabla y no hay ninguna
  // urgencia en que se apliquen al instante.

  // Por antigüedad: borra los privados anteriores al corte y devuelve las URLs de
  // las fotos que se van con ellos.
  pruneDmsOlderThan: (cutoff) => {
    const orphans = db
      .prepare(
        'SELECT image_url FROM messages WHERE room IS NULL AND created_at <= ? AND image_url IS NOT NULL'
      )
      .all(cutoff)
      .map((r) => r.image_url);
    db.prepare('DELETE FROM messages WHERE room IS NULL AND created_at <= ?').run(cutoff);
    return orphans;
  },

  // Por conversación: deja como mucho `keep` mensajes en cada charla. El par se
  // ordena con MIN/MAX (la versión de dos argumentos, que es la escalar) para que
  // "a le escribe a b" y "b le escribe a a" cuenten como la misma conversación.
  pruneDmPairs: (keep = DM_PAIR_LIMIT) => {
    const pairs = db
      .prepare(`
        SELECT MIN(sender, recipient) AS a, MAX(sender, recipient) AS b, COUNT(*) AS n
        FROM messages WHERE room IS NULL AND recipient IS NOT NULL
        GROUP BY a, b HAVING n > ?
      `)
      .all(keep);

    const cutoffFor = db.prepare(`
      SELECT id FROM messages
      WHERE room IS NULL AND ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?))
      ORDER BY id DESC LIMIT 1 OFFSET ?
    `);
    const imagesBefore = db.prepare(`
      SELECT image_url FROM messages
      WHERE room IS NULL AND id < ? AND image_url IS NOT NULL
        AND ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?))
    `);
    const deleteBefore = db.prepare(`
      DELETE FROM messages
      WHERE room IS NULL AND id < ?
        AND ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?))
    `);

    const orphans = [];
    for (const { a, b } of pairs) {
      const cutoff = cutoffFor.get(a, b, b, a, keep - 1);
      if (!cutoff) continue;
      imagesBefore.all(cutoff.id, a, b, b, a).forEach((r) => orphans.push(r.image_url));
      deleteBefore.run(cutoff.id, a, b, b, a);
    }
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
