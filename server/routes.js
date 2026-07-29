const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { users, rooms, guestBans } = require('./db');
const { signToken, verifyToken } = require('./auth');
const { syncMuted } = require('./socket');
const { UPLOADS_DIR, uploadUrl } = require('./uploads');

const router = express.Router();

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
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = username && users.findByUsername(username);

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
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

  res.json({
    success: true,
    token: signToken(user),
    username: user.username,
    role: user.role,
    name: user.name,
  });
});

router.post('/register', (req, res) => {
  const { username, password, name, email, country } = req.body || {};

  if (!username || !password || !name || !email) {
    return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
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
  if (users.findByUsername(username)) {
    return res.status(400).json({ success: false, message: 'El usuario ya existe' });
  }

  users.create({
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    name,
    email,
    country: country || null,
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
  if (!users.findByUsername(req.params.username)) {
    return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
  }
  users.setBanned(req.params.username, false);
  res.json({ success: true });
});

router.post('/users/:username/unmute', requireAdmin, (req, res) => {
  if (!users.findByUsername(req.params.username)) {
    return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
  }
  users.setMuted(req.params.username, false);
  // Si está conectado, levantar el silencio en su sesión viva también
  syncMuted(req.app.get('io'), req.params.username, false);
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

router.post('/upload', (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera el límite de 5 MB' : err.message;
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen' });
    }
    res.json({ success: true, url: uploadUrl(req.file.filename) });
  });
});

module.exports = router;
