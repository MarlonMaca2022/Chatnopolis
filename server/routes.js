const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { users, rooms, guestBans } = require('./db');
const { signToken, sessionAccount } = require('./auth');
const { syncMuted, syncProfile, sessionForSocket, revokeSessions } = require('./socket');
const { UPLOADS_DIR, uploadUrl, checkQuota, noteUploaded, removeUploadFile } = require('./uploads');
const {
  loginLimiter,
  registerLimiter,
  secondFactorBlocked,
  noteSecondFactorFailure,
} = require('./ratelimit');
const totp = require('./totp');
const { isReservedNick } = require('./nicks');
const { validGender } = require('./profile');
const { TERMS_VERSION, CONSENT_REQUIRED } = require('./legal');

const router = express.Router();

// Hash de descarte para comparar cuando el usuario NO existe. Sin esto, un login
// con usuario inexistente responde al instante y uno con usuario real tarda lo que
// tarda bcrypt: esa diferencia de tiempo sola ya dice qué cuentas existen. Se
// calcula una vez al arrancar.
const DUMMY_HASH = bcrypt.hashSync('contraseña-que-nunca-nadie-usa', 10);

// --- Middleware de autenticación ---
// Revalida contra la base en cada pedido (sessionAccount): un token robado deja de
// servir apenas se cierran las sesiones de la cuenta, y uno de una cuenta baneada
// no sigue abriendo el panel hasta que le venza.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = sessionAccount(token);
  if (!session) return res.status(401).json({ success: false, message: 'No autorizado' });
  if (users.banStatus(session.user.username).banned) {
    return res.status(403).json({ success: false, message: 'Tu cuenta está baneada' });
  }
  req.user = { username: session.user.username, role: session.user.role };
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

// Segundo factor de una cuenta que lo tiene activo: el código de la app o uno de
// los de recuperación. Devuelve null si pasa, o { status, message } para responder.
function checkSecondFactor(user, code) {
  if (secondFactorBlocked(user.username_canon)) {
    return {
      status: 429,
      message: 'Demasiados códigos incorrectos. Esperá 15 minutos y volvé a probar.',
    };
  }
  const step = totp.verify(user.totp_secret, code, { afterStep: user.totp_last_step });
  if (step !== null) {
    users.setTotpStep(user.username, step);
    return null;
  }
  if (users.useRecoveryCode(user, totp.hashRecoveryCode(code))) return null;
  noteSecondFactorFailure(user.username_canon);
  return { status: 401, message: 'Código incorrecto' };
}

// --- Auth ---
router.post('/login', loginLimiter, (req, res) => {
  const { username, password, acceptedTerms, code } = req.body || {};
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
  const termsOutdated = user.terms_version !== TERMS_VERSION;
  if (termsOutdated && acceptedTerms !== true) {
    return res.json({ success: true, termsOutdated: true, message: CONSENT_REQUIRED });
  }

  // Verificación en dos pasos: mismo patrón, 200 sin token hasta que llegue el código.
  // Va DESPUÉS de los términos y ANTES de cualquier escritura: la aceptación recién se
  // guarda con el código verificado, así que la contraseña sola no cambia nada de la
  // cuenta. Y el código se consume una sola vez, en el pedido que firma el token.
  if (user.totp_secret) {
    if (!code) return res.json({ success: true, needsCode: true });
    const failure = checkSecondFactor(user, code);
    if (failure) return res.status(failure.status).json({ success: false, message: failure.message });
  }

  if (termsOutdated) users.acceptTerms(user.username, TERMS_VERSION);

  res.json({
    success: true,
    token: signToken(user),
    username: user.username,
    role: user.role,
    name: user.name,
    gender: user.gender,
  });
});

router.post('/register', registerLimiter, (req, res) => {
  const { username, password, name, email, country, gender, acceptedTerms } = req.body || {};

  if (!username || !password || !name || !email) {
    return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
  }
  // El checkbox del formulario no alcanza: se evade con la consola del navegador.
  // La declaración de edad y la aceptación valen porque se exigen acá.
  if (acceptedTerms !== true) {
    return res.status(400).json({ success: false, message: CONSENT_REQUIRED });
  }
  if (!validGender(gender)) {
    return res.status(400).json({ success: false, message: 'Elige si eres hombre, mujer u otro' });
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
  if (isReservedNick(username)) {
    return res.status(400).json({ success: false, message: 'Ese nombre está reservado. Elige otro.' });
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
    gender,
    termsVersion: TERMS_VERSION,
  });

  res.json({ success: true, username, role: 'user' });
});

// --- Verificación en dos pasos ---
// Sirve para cualquier cuenta registrada, aunque hoy la pantalla para activarla
// solo está en el panel de admin. Se lee la fila fresca en cada pedido: el token
// dice quién es, pero no si ya activó o desactivó el segundo factor.
function currentUser(req, res) {
  const user = users.findByNick(req.user.username);
  if (!user) res.status(401).json({ success: false, message: 'No autorizado' });
  return user;
}

router.get('/2fa', requireAuth, (req, res) => {
  const user = currentUser(req, res);
  if (!user) return;
  res.json({ enabled: !!user.totp_secret, recoveryLeft: users.recoveryHashes(user).length });
});

// Paso 1: secreto nuevo + QR. Queda pendiente hasta que se confirme con un código,
// y pedir otro reemplaza al anterior (escanear dos veces no deja dos válidos).
router.post('/2fa/setup', requireAuth, async (req, res) => {
  const user = currentUser(req, res);
  if (!user) return;
  if (user.totp_secret) {
    return res.status(400).json({ success: false, message: 'La verificación en dos pasos ya está activa' });
  }
  const secret = totp.generateSecret();
  users.setTotpPending(user.username, secret);
  // El QR se genera acá y no con un servicio externo de QR: el secreto no sale del servidor.
  // try/catch porque Express 4 no atrapa los errores de un handler async.
  try {
    const qr = await QRCode.toDataURL(totp.otpauthUrl(secret, user.username), { margin: 1, width: 220 });
    res.json({ success: true, secret, qr });
  } catch {
    res.status(500).json({ success: false, message: 'No se pudo generar el código QR' });
  }
});

// Paso 2: un código de la app prueba que se escaneó bien. Recién ahí se activa y se
// generan los códigos de recuperación, que viajan esta única vez en claro.
// Pide la contraseña: si no, con un token robado alguien activaría el segundo
// factor con SU celular y dejaría al dueño afuera de su propia cuenta.
router.post('/2fa/enable', loginLimiter, requireAuth, (req, res) => {
  const user = currentUser(req, res);
  if (!user) return;
  if (user.totp_secret) {
    return res.status(400).json({ success: false, message: 'La verificación en dos pasos ya está activa' });
  }
  if (!user.totp_pending) {
    return res.status(400).json({ success: false, message: 'Primero generá el código QR' });
  }
  const { password, code } = req.body || {};
  if (!bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
  }
  const step = totp.verify(user.totp_pending, code);
  if (step === null) {
    return res.status(400).json({
      success: false,
      message: 'Código incorrecto. Revisá que la hora del celular esté en automático.',
    });
  }
  const recoveryCodes = totp.generateRecoveryCodes();
  users.enableTotp(user.username, user.totp_pending, step, recoveryCodes.map(totp.hashRecoveryCode));
  const token = renewAfterSecurityChange(req, user, 'Se activó la verificación en dos pasos en tu cuenta.');
  res.json({ success: true, recoveryCodes, token });
});

// Desactivar pide contraseña Y código: con un token robado solo no alcanza para
// sacarle la protección a la cuenta. loginLimiter porque cuesta un bcrypt.
router.post('/2fa/disable', loginLimiter, requireAuth, (req, res) => {
  const user = currentUser(req, res);
  if (!user) return;
  if (!user.totp_secret) {
    return res.status(400).json({ success: false, message: 'La verificación en dos pasos no está activa' });
  }
  const { password, code } = req.body || {};
  if (!bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
  }
  const failure = checkSecondFactor(user, code);
  if (failure) return res.status(failure.status).json({ success: false, message: failure.message });
  users.disableTotp(user.username);
  const token = renewAfterSecurityChange(req, user, 'Se desactivó la verificación en dos pasos en tu cuenta.');
  res.json({ success: true, token });
});

// Cambiar cómo se entra a la cuenta cierra las demás sesiones: si alguien tenía una
// abierta (o un token copiado), activar el segundo factor no serviría de nada si lo
// dejara adentro. La pestaña desde la que se hizo el cambio sigue: recibe un token
// nuevo y su socket, identificado por X-Socket-Id, queda con la versión nueva.
function renewAfterSecurityChange(req, user, what) {
  revokeSessions(req.app.get('io'), user.username, {
    keepSocketId: req.get('X-Socket-Id'),
    reason: `${what} Inicia sesión de nuevo.`,
  });
  return signToken(users.findByNick(user.username));
}

// --- Sesiones ---
// "Cerrar sesión en todos los dispositivos", incluido este. Es la salida si se
// sospecha que alguien entró con la cuenta: su token deja de valer en el acto y la
// conexión que tenga abierta se corta. No pide contraseña a propósito: quien lo use
// con un token robado se echa a sí mismo también, y el dueño vuelve a entrar.
router.post('/sessions/revoke', requireAuth, (req, res) => {
  revokeSessions(req.app.get('io'), req.user.username, {
    reason: 'Se cerraron todas las sesiones de tu cuenta. Inicia sesión de nuevo.',
  });
  res.json({ success: true });
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

// Mismo destino, nombres y tipos para las dos clases de foto; cambia el tope.
const photoUploader = (maxMb) =>
  multer({
    storage: multer.diskStorage({
      destination: UPLOADS_DIR,
      filename: (req, file, cb) => {
        const ext = ALLOWED_TYPES[file.mimetype];
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_TYPES[file.mimetype]) {
        return cb(new Error('Solo se permiten imágenes (jpg, png, gif, webp)'));
      }
      cb(null, true);
    },
  });

const upload = photoUploader(5);
// La foto de perfil se descarga para cada persona de la sala, en cada mensaje: 1 MB.
// El cliente ya la reduce a 512 px (unos 20-80 KB), así que el tope en la práctica
// frena los GIF pesados, que se suben tal cual para no perder la animación.
// Tiene que coincidir con AVATAR_LIMIT_MB de ProfileModal.jsx, que avisa antes de subir.
const AVATAR_LIMIT_MB = 1;
const avatarUpload = photoUploader(AVATAR_LIMIT_MB);

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

// --- Mi perfil (cuentas registradas) ---
// El invitado no pasa por acá: su nick y su género cambian por el socket
// (profile:update), porque no tiene cuenta donde guardarlos.

router.get('/profile', requireAuth, (req, res) => {
  const user = currentUser(req, res);
  if (!user) return;
  res.json({ username: user.username, role: user.role, gender: user.gender, avatarUrl: user.avatar_url });
});

router.patch('/profile', requireAuth, (req, res) => {
  const user = currentUser(req, res);
  if (!user) return;
  const { gender } = req.body || {};
  if (!validGender(gender)) {
    return res.status(400).json({ success: false, message: 'Elige si eres hombre, mujer u otro' });
  }
  users.setGender(user.username, gender);
  syncProfile(req.app.get('io'), user.username, { gender });
  res.json({ success: true, gender });
});

// Foto de perfil: mismas cuotas que las fotos de los privados (el techo de disco las
// cubre a las dos) pero tope propio de 1 MB (avatarUpload). Un silenciado no puede cambiarla: es tan
// visible como un mensaje en la sala.
function requireAvatarAllowed(req, res, next) {
  const user = currentUser(req, res);
  if (!user) return;
  if (user.is_muted) return res.status(403).json({ success: false, message: 'Estás silenciado.' });
  req.account = user;
  next();
}

router.post('/profile/avatar', requireAuth, requireAvatarAllowed, (req, res) => {
  const verdict = checkQuota(req.account.username_canon);
  if (!verdict.ok) return res.status(verdict.status).json({ success: false, message: verdict.message });
  avatarUpload.single('photo')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `La foto de perfil puede pesar hasta ${AVATAR_LIMIT_MB} MB`
          : err.message;
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen' });
    }
    noteUploaded(req.account.username_canon, req.file.size);
    const url = uploadUrl(req.file.filename);
    // La anterior deja de servir apenas se reemplaza: se borra ya, no en el barrido
    removeUploadFile(users.setAvatar(req.account.username, url));
    syncProfile(req.app.get('io'), req.account.username, { avatarUrl: url });
    res.json({ success: true, avatarUrl: url });
  });
});

router.delete('/profile/avatar', requireAuth, (req, res) => {
  const user = currentUser(req, res);
  if (!user) return;
  removeUploadFile(users.setAvatar(user.username, null));
  syncProfile(req.app.get('io'), user.username, { avatarUrl: null });
  res.json({ success: true });
});

module.exports = router;
