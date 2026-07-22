const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { users, rooms } = require('./db');
const { signToken, verifyToken } = require('./auth');

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
  if (user.is_banned) {
    return res.status(403).json({ success: false, message: 'Usuario baneado.' });
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
    users.all().map((u) => ({
      username: u.username,
      role: u.role,
      isBanned: !!u.is_banned,
      isMuted: !!u.is_muted,
    }))
  );
});

// --- Subida de fotos ---
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
  });
});

module.exports = router;
