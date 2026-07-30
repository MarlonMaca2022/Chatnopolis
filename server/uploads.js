const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Mismo formato que genera multer y que valida el socket: /uploads/<archivo>
const UPLOAD_URL_RE = /^\/uploads\/([\w.-]+)$/;

// --- Techo de disco ---
// Sin esto, subir fotos es un buzón sin fondo: se llena el disco, SQLite no puede
// escribir más y se cae el chat entero, no solo las fotos. 0 = sin techo.
const DISK_LIMIT_MB = Number(process.env.PHOTO_DISK_LIMIT_MB ?? 500);
const DISK_LIMIT_BYTES = DISK_LIMIT_MB * 1024 * 1024;

// --- Cuotas de subida ---
// Por persona frena al que abusa; la global acota la velocidad con la que se puede
// llenar el disco aunque el atacante use muchas identidades distintas.
const PER_USER_LIMIT = 12;
const PER_USER_WINDOW_MS = 5 * 60_000;
const GLOBAL_LIMIT = 60;
const GLOBAL_WINDOW_MS = 60_000;

const userUploads = new Map(); // canon -> [timestamps]
let globalUploads = []; // [timestamps]

// Cuántos bytes ocupa uploads/. Se calcula al primer uso y se mantiene al día:
// se suma en cada subida, se resta en cada borrado y se recalcula en cada barrido
// (que ya recorre el directorio, así que no cuesta nada extra).
let bytesUsed = null;

function recalcUsage() {
  let total = 0;
  try {
    for (const file of fs.readdirSync(UPLOADS_DIR)) {
      try {
        const stat = fs.statSync(path.join(UPLOADS_DIR, file));
        if (stat.isFile()) total += stat.size;
      } catch {
        // borrado entre el readdir y el stat: no cuenta
      }
    }
  } catch {
    total = 0;
  }
  bytesUsed = total;
  return total;
}

const usage = () => (bytesUsed === null ? recalcUsage() : bytesUsed);

function uploadUrl(filename) {
  return `/uploads/${filename}`;
}

// Borra el archivo de una URL /uploads/... Devuelve true solo si borró algo.
// Ignora rutas ajenas, intentos de salir del directorio y archivos ya inexistentes.
function removeUploadFile(url) {
  const match = typeof url === 'string' && url.match(UPLOAD_URL_RE);
  if (!match) return false;

  const file = path.join(UPLOADS_DIR, match[1]);
  if (path.dirname(file) !== UPLOADS_DIR) return false; // p. ej. "/uploads/.."

  try {
    // El tamaño se lee antes de borrar para poder descontarlo del total
    const { size } = fs.statSync(file);
    fs.unlinkSync(file);
    if (bytesUsed !== null) bytesUsed = Math.max(0, bytesUsed - size);
    return true;
  } catch {
    return false;
  }
}

const recent = (timestamps, windowMs, now) => timestamps.filter((t) => now - t < windowMs);

// ¿Puede esta identidad subir una foto ahora? Devuelve { ok } o { ok:false, status, message }.
// Se consulta ANTES de recibir el archivo: si no, ya lo escribimos en el disco que
// estamos tratando de proteger.
function checkQuota(canon) {
  const now = Date.now();

  if (DISK_LIMIT_BYTES > 0 && usage() >= DISK_LIMIT_BYTES) {
    return {
      ok: false,
      status: 507,
      message: 'El servidor no tiene espacio para más fotos por ahora. Probá de nuevo más tarde.',
    };
  }

  globalUploads = recent(globalUploads, GLOBAL_WINDOW_MS, now);
  if (globalUploads.length >= GLOBAL_LIMIT) {
    return {
      ok: false,
      status: 429,
      message: 'Se están subiendo muchas fotos en este momento. Esperá un minuto.',
    };
  }

  const mine = recent(userUploads.get(canon) || [], PER_USER_WINDOW_MS, now);
  userUploads.set(canon, mine);
  if (mine.length >= PER_USER_LIMIT) {
    return {
      ok: false,
      status: 429,
      message: `Ya subiste ${PER_USER_LIMIT} fotos en los últimos minutos. Esperá un rato.`,
    };
  }

  return { ok: true };
}

// Se llama recién cuando el archivo quedó guardado: las cuotas cuentan subidas
// efectivas, no intentos fallidos.
function noteUploaded(canon, bytes) {
  const now = Date.now();
  globalUploads.push(now);
  userUploads.set(canon, [...(userUploads.get(canon) || []), now]);
  if (bytesUsed !== null) bytesUsed += bytes;
}

// Identidades sin subidas recientes: si no, el mapa crece con cada invitado que pasa.
function pruneQuotas() {
  const now = Date.now();
  for (const [canon, timestamps] of userUploads) {
    const left = recent(timestamps, PER_USER_WINDOW_MS, now);
    if (left.length === 0) userUploads.delete(canon);
    else userUploads.set(canon, left);
  }
}

module.exports = {
  UPLOADS_DIR,
  uploadUrl,
  removeUploadFile,
  checkQuota,
  noteUploaded,
  pruneQuotas,
  recalcUsage,
  usage,
  DISK_LIMIT_MB,
  DISK_LIMIT_BYTES,
  PER_USER_LIMIT,
};
