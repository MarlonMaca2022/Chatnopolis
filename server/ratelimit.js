const rateLimit = require('express-rate-limit');

// Todo lo que frena el abuso por *frecuencia* vive acá: los límites de las rutas
// REST y el del chat en vivo. Las cuotas de fotos están aparte (server/uploads.js)
// porque miden otra cosa: bytes en disco, no peticiones por minuto.
//
// Por qué importa: bcryptjs es JS puro y `compareSync` bloquea el único hilo de
// Node varios cientos de milisegundos. Sin un freno acá, unas pocas peticiones a
// /api/login por segundo congelan el chat entero, no solo el login.

// --- IP real detrás de nginx ---
// Con un reverse proxy delante, TODAS las peticiones llegan desde 127.0.0.1: sin
// esto los límites por IP se aplicarían a todo el tráfico junto y el primer
// abusivo dejaría afuera a los demás.
//
// Está APAGADO por defecto a propósito. Si confiáramos siempre en X-Forwarded-For,
// un servidor sin proxy delante creería la cabecera que le mande cualquiera y los
// límites se saltarían mandando una IP inventada en cada intento. Se enciende con
// TRUST_PROXY=1 en el .env — que es lo que corresponde en el VPS (ver DEPLOY.md).
const TRUST_PROXY = ['1', 'true'].includes((process.env.TRUST_PROXY || '').trim());

// nginx usa `X-Forwarded-For $proxy_add_x_forwarded_for`, que AGREGA la IP real al
// final de la lista. Lo anterior lo puede haber escrito el cliente, así que el
// único valor en el que se puede confiar es el último.
function clientIp(handshake) {
  if (TRUST_PROXY) {
    const forwarded = handshake?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const hops = forwarded.split(',');
      return hops[hops.length - 1].trim();
    }
  }
  return handshake?.address || 'desconocida';
}

// --- Límites de las rutas REST ---

const tooMany = (message) => (req, res) => res.status(429).json({ success: false, message });

// Solo cuentan los intentos FALLIDOS: quien acierta la contraseña no gasta cupo,
// así que a un usuario normal este límite le resulta invisible.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany('Demasiados intentos fallidos. Esperá 15 minutos y volvé a probar.'),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany('Se crearon demasiadas cuentas desde esta conexión. Probá dentro de un rato.'),
});

// Red de contención para el resto de /api. Es holgado a propósito: acá no hay nada
// caro, solo evita que alguien martille los endpoints de lectura.
const apiLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany('Demasiadas peticiones. Esperá un momento.'),
});

// --- Freno del chat en vivo ---
// Un `for(;;) socket.emit('chatMessage')` inunda la sala, escribe una fila por
// mensaje y empuja el historial real fuera del límite de 500. Estos números están
// muy por encima de lo que puede escribir una persona y muy por debajo de lo que
// hace un script.
const MESSAGE_LIMIT = 10; // mensajes (sala + privados)
const MESSAGE_WINDOW_MS = 10_000;
const QUERY_LIMIT = 20; // cambios de sala y pedidos de historial: tocan la DB
const QUERY_WINDOW_MS = 10_000;
// El aviso de "vas muy rápido" se manda como mucho una vez cada tanto: si
// respondiéramos a cada mensaje bloqueado, un flood de entrada se convertiría en
// un flood de salida y estaríamos ayudando al atacante.
const WARN_COOLDOWN_MS = 5_000;

// Handshakes por IP. Es un límite de *ritmo*, no de conexiones simultáneas: varias
// personas detrás del mismo router (una oficina, un colegio) comparten IP y un tope
// de sesiones abiertas las dejaría afuera. Lo que frenamos es el bucle que abre
// cientos de conexiones por minuto.
const CONNECTION_LIMIT = 60;
const CONNECTION_WINDOW_MS = 60_000;

const buckets = new Map(); // socketId -> { messages: [], queries: [], warnedAt }
const connections = new Map(); // ip -> [timestamps]

const recent = (timestamps, windowMs, now) => timestamps.filter((t) => now - t < windowMs);

function bucketFor(socketId) {
  let bucket = buckets.get(socketId);
  if (!bucket) {
    bucket = { messages: [], queries: [], warnedAt: 0 };
    buckets.set(socketId, bucket);
  }
  return bucket;
}

function allow(bucket, key, limit, windowMs) {
  const now = Date.now();
  bucket[key] = recent(bucket[key], windowMs, now);
  if (bucket[key].length >= limit) return false;
  bucket[key].push(now);
  return true;
}

// ¿Puede este socket mandar un mensaje ahora? Cuenta el intento aunque se rechace:
// insistir no sirve de nada, que es justamente lo que queremos.
const allowMessage = (socketId) =>
  allow(bucketFor(socketId), 'messages', MESSAGE_LIMIT, MESSAGE_WINDOW_MS);

const allowQuery = (socketId) =>
  allow(bucketFor(socketId), 'queries', QUERY_LIMIT, QUERY_WINDOW_MS);

// true como mucho una vez cada WARN_COOLDOWN_MS, para no amplificar el flood.
function shouldWarn(socketId) {
  const bucket = bucketFor(socketId);
  const now = Date.now();
  if (now - bucket.warnedAt < WARN_COOLDOWN_MS) return false;
  bucket.warnedAt = now;
  return true;
}

function allowConnection(ip) {
  const now = Date.now();
  const hits = recent(connections.get(ip) || [], CONNECTION_WINDOW_MS, now);
  if (hits.length >= CONNECTION_LIMIT) {
    connections.set(ip, hits);
    return false;
  }
  connections.set(ip, [...hits, now]);
  return true;
}

// Al desconectarse no hace falta seguir recordando su ritmo.
const forgetSocket = (socketId) => buckets.delete(socketId);

// IPs sin conexiones recientes: si no, el mapa crece con cada visita. Lo llama el
// barrido de cleanup.js, igual que pruneQuotas() de uploads.js.
function pruneConnections() {
  const now = Date.now();
  for (const [ip, timestamps] of connections) {
    const left = recent(timestamps, CONNECTION_WINDOW_MS, now);
    if (left.length === 0) connections.delete(ip);
    else connections.set(ip, left);
  }
}

module.exports = {
  TRUST_PROXY,
  clientIp,
  loginLimiter,
  registerLimiter,
  apiLimiter,
  allowMessage,
  allowQuery,
  shouldWarn,
  allowConnection,
  forgetSocket,
  pruneConnections,
  MESSAGE_LIMIT,
};
