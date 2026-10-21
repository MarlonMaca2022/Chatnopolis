const crypto = require('crypto');

// TOTP (RFC 6238), el código de 6 dígitos de Google Authenticator, Authy, 1Password…
// Son treinta líneas sobre node:crypto: no justifica una dependencia más en el
// camino del login, que es justo el que protege al admin.

const STEP_SECONDS = 30;
const DIGITS = 6;
// Se acepta el paso anterior y el siguiente: el reloj del celular rara vez está
// clavado con el del servidor, y escribir el código lleva unos segundos.
const DRIFT_STEPS = 1;
const ISSUER = 'Chatnopolis';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32, el formato de las apps

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of str.replace(/[\s=]/g, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Secreto TOTP inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// 160 bits, lo que recomienda el RFC para HMAC-SHA1
const generateSecret = () => base32Encode(crypto.randomBytes(20));

function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

// Devuelve el paso que coincidió, o null. Quien llama guarda ese paso y pasa
// `afterStep` la próxima vez: así un código ya usado no sirve dos veces (alguien
// que lo vio por encima del hombro no puede reutilizarlo en los 30 s que le quedan).
function verify(secret, code, { afterStep = -1, now = Date.now() } = {}) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const step = currentStep(now);
  for (let s = step - DRIFT_STEPS; s <= step + DRIFT_STEPS; s++) {
    if (s <= afterStep) continue;
    const expected = Buffer.from(codeAt(secret, s));
    if (crypto.timingSafeEqual(expected, Buffer.from(clean))) return s;
  }
  return null;
}

// Lo que se codifica en el QR. La etiqueta es lo que la app muestra en su lista.
const otpauthUrl = (secret, username) =>
  `otpauth://totp/${encodeURIComponent(`${ISSUER}:${username}`)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

// --- Códigos de recuperación ---
// Para cuando se pierde el celular. Son de un solo uso y se guardan con hash:
// tienen 40 bits al azar, así que alcanza con SHA-256 — bcrypt bloquearía el hilo
// de Node una vez por código en cada intento (ver server/ratelimit.js).
const RECOVERY_COUNT = 10;

const generateRecoveryCodes = () =>
  Array.from({ length: RECOVERY_COUNT }, () => {
    const hex = crypto.randomBytes(5).toString('hex');
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });

const normalizeRecovery = (code) => String(code || '').toLowerCase().replace(/[^0-9a-f]/g, '');

const hashRecoveryCode = (code) =>
  crypto.createHash('sha256').update(normalizeRecovery(code)).digest('hex');

module.exports = {
  generateSecret,
  verify,
  otpauthUrl,
  generateRecoveryCodes,
  hashRecoveryCode,
  // Solo para las pruebas contra los vectores del RFC
  codeAt,
  base32Encode,
};
