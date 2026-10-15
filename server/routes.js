const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { users, rooms, guestBans } = require('./db');
const { signToken, verifyToken } = require('./auth');
const { syncMuted, sessionForSocket } = require('./socket');
const { UPLOADS_DIR, uploadUrl, checkQuota, noteUploaded } = require('./uploads');
const { loginLimiter, registerLimiter } = require('./ratelimit');
const { TERMS_VERSION, CONSENT_REQUIRED } = require('./legal');

const router = express.Router();

// Hash de descarte para comparar cuando el usuario NO existe. Sin esto, un login
// con usuario inexistente responde al instante y uno con usuario real tarda lo que
// tarda bcrypt: esa diferencia de tiempo sola ya dice qué cuentas existen. Se
// calcula una vez al arrancar.
const DUMMY_HASH = bcrypt.hashSync('contraseña-que-nunca-nadie-usa', 10);

// --- Middleware de autenticación ---
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ success: false, message: 'No autorizado' });
  req.user = payload;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Solo administradores' });
    }
    next();
  });
}

// --- Auth ---
router.post('/login', loginLimiter, (req, res) => {
  const { username, password, acceptedTerms } = req.body || {};
  // findByNick: entrar como "Admin" o "ADMIN" es entrar como "admin"
  const user = username && users.findByNick(username);

  // Comparamos siempre, exista o no la cuenta: los dos caminos tienen que costar
  // lo mismo (ver DUMMY_HASH). El `ok` de un usuario inexistente es siempre false.
  const ok = bcrypt.compareSync(password || '', user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
  }
  // banStatus deja pasar (y limpia) los bans ya vencidos
  const ban = users.banStatus(user.username);
  if (ban.banned) {
    return res.status(403).json({
      success: false,
      message: ban.until
        ? `Tu cuenta está baneada hasta el ${new Date(ban.until).toLocaleString('es')}.`
        : 'Tu cuenta está baneada de forma permanente.',
    });
  }

  // Términos desactualizados (o cuenta anterior a que existieran): se le piden acá.
  // La clave es que en ese caso NO se firma token — sin token no hay sesión, así que
  // el paso no se saltea desde el cliente. Es un 200, no un error, así que tampoco
  // le come intentos del loginLimiter (que tiene skipSuccessfulRequests).
  if (user.terms_version !== TERMS_VERSION) {
    if (acceptedTerms !== true) {
      return res.json({ success: true, termsOutdated: true, message: CONSENT_REQUIRED });
    }
    users.acceptTerms(user.username, TERMS_VERSION);
  }

  res.json({
    success: true,
    token: signToken(user),
    username: user.username,
    role: user.role,
    name: user.name,
  });
});

router.post('/register', registerLimiter, (req, res) => {
  const { username, password, name, email, country, acceptedTerms } = req.body || {};

  if (!username || !password || !name || !email) {
    return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
  }
  // El checkbox del formulario no alcanza: se evade con la consola del navegador.
  // La declaración de edad y la aceptación valen porque se exigen acá.
  if (acceptedTerms !== true) {
    return res.status(400).json({ success: false, message: CONSENT_REQUIRED });
  }
  // Campos de texto libre: sin un techo, un POST puede meter megabytes por fila.
  if (name.length > 60 || email.length > 120 || (country && country.length > 60)) {
    return res.status(400).json({ success: false, message: 'Alguno de los datos es demasiado largo' });
  }
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'El email no parece válido' });
  }
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
    return res.status(400).json({
      success: false,
      message: 'El usuario debe tener 3-20 caracteres (letras, números, _ o -)',
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
  }
  // Por canónica: "Admin" no puede registrarse al lado de "admin"
  if (users.findByNick(username)) {
    return res.status(400).json({ success: false, message: 'El usuario ya existe' });
  }

  users.create({
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    name,
    email,
    country: country || null,
    termsVersion: TERMS_VERSION,
  });

  res.json({ success: true, username, role: 'user' });
});

// --- Rooms ---
router.get('/rooms', (req, res) => res.json(rooms.all()));

router.post('/rooms', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Nombre requerido' });
  }
  const id = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) return res.status(400).json({ success: false, message: 'Nombre inválido' });
  if (rooms.find(id)) return res.status(400).json({ success: false, message: 'Sala ya existe' });

  rooms.create(id, name.trim(), req.user.username);
  const all = rooms.all();
  req.app.get('io').emit('roomsUpdate', all);
  res.json({ success: true, room: { id, name: name.trim() } });
});

router.delete('/rooms/:id', requireAdmin, (req, res) => {
  if (req.params.id === 'general') {
    return res.status(400).json({ success: false, message: 'No se puede eliminar la sala General' });
  }
  rooms.remove(req.params.id);
  req.app.get('io').emit('roomsUpdate', rooms.all());
  res.json({ success: true });
});

// --- Users (solo admin ve la lista completa) ---
router.get('/users', requireAdmin, (req, res) => {
  res.json(
    users.all().map((u) => {
      // Vía banStatus para no reportar como baneado a alguien cuyo ban ya venció
      const ban = users.banStatus(u.username);
      return {
        username: u.username,
        role: u.role,
        isBanned: ban.banned,
        bannedUntil: ban.until,
        isMuted: !!u.is_muted,
      };
    })
  );
});

router.post('/users/:username/unban', requireAdmin, (req, res) => {
  const user = users.findByNick(req.params.username);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
  }
  users.setBanned(user.username, false);
  res.json({ success: true });
});

router.post('/users/:username/unmute', requireAdmin, (req, res) => {
  const user = users.findByNick(req.params.username);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
  }
  users.setMuted(user.username, false);
  // Si está conectado, levantar el silencio en sus sesiones vivas también
  syncMuted(req.app.get('io'), user.username, false);
  res.json({ success: true });
});

// --- Bans de invitados (no existen en la tabla users) ---
router.get('/guest-bans', requireAdmin, (req, res) => res.json(guestBans.all()));

router.delete('/guest-bans/:username', requireAdmin, (req, res) => {
  guestBans.remove(req.params.username);
  res.json({ success: true });
});

// --- Subida de fotos (solo se usan en mensajes privados; ver server/socket.js) ---
const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = ALLOWED_TYPES[file.mimetype];
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES[file.mimetype]) {
      return cb(new Error('Solo se permiten imágenes (jpg, png, gif, webp)'));
    }
    cb(null, true);
  },
});

// Quien sube tiene que estar conectado al chat. Los invitados no tienen cuenta ni
// token, así que su credencial es la sesión viva: el cliente manda su socket id y
// acá se verifica contra los usuarios en línea. Sin esto el endpoint es público y
// cualquiera puede llenar el disco con un script (ver DEPLOY.md).
function requireChatSession(req, res, next) {
  const session = sessionForSocket(req.get('X-Socket-Id'));
  if (!session) {
    return res.status(401).json({
      success: false,
      message: 'Tenés que estar conectado al chat para enviar fotos.',
    });
  }
  if (session.isMuted) {
    return res.status(403).json({ success: false, message: 'Estás silenciado.' });
  }
  req.chatUser = session;
  next();
}

// Las cuotas se chequean ANTES de recibir el archivo: si no, para saber si había
// que rechazarlo ya lo habríamos escrito en el disco que estamos protegiendo.
function enforceQuota(req, res, next) {
  const verdict = checkQuota(req.chatUser.canon);
  if (!verdict.ok) {
    return res.status(verdict.status).json({ success: false, message: verdict.message });
  }
  next();
}

router.post('/upload', requireChatSession, enforceQuota, (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera el límite de 5 MB' : err.message;
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen' });
    }
    // Recién acá cuenta para la cuota: se cobran subidas efectivas, no intentos
    noteUploaded(req.chatUser.canon, req.file.size);
    res.json({ success: true, url: uploadUrl(req.file.filename) });
  });
});

module.exports = router;
