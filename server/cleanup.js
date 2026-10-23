const fs = require('fs');
const path = require('path');
const { messages, users } = require('./db');
const {
  UPLOADS_DIR,
  uploadUrl,
  removeUploadFile,
  recalcUsage,
  pruneQuotas,
  usage,
  DISK_LIMIT_MB,
} = require('./uploads');
const { pruneConnections } = require('./ratelimit');

// Cuánto vive una foto antes de borrarse del disco. 0 = sin vencimiento por tiempo
// (igual desaparecen cuando su mensaje sale del límite de historial).
const PHOTO_TTL_MINUTES = Number(process.env.PHOTO_TTL_MINUTES ?? 1440);
// Archivos que ningún mensaje referencia (subidas que nunca se enviaron, mensajes
// podados): se borran pasado este margen, aunque el TTL esté desactivado.
const ORPHAN_GRACE_MINUTES = 60;
const SWEEP_INTERVAL_MS = 5 * 60_000;
// Cuánto se guarda un mensaje privado. Las salas ya tienen su techo (500 mensajes)
// y las fotos el suyo (TTL + límite de disco); los privados no tenían ninguno, así
// que la base era lo único que podía crecer para siempre. 0 = sin vencimiento.
const DM_RETENTION_DAYS = Number(process.env.DM_RETENTION_DAYS ?? 90);

// created_at se guarda con datetime('now') => 'YYYY-MM-DD HH:MM:SS' en UTC.
// Con ese formato la comparación de texto equivale a comparar fechas.
const sqliteTimestamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000);

// Poda el historial de la sala y borra los archivos que quedaron sin mensaje.
function pruneRoom(room) {
  messages.pruneRoom(room).forEach(removeUploadFile);
}

// Recorta los privados: por antigüedad y por conversación. Las fotos que quedan
// sin mensaje se borran acá mismo; el barrido de huérfanos las agarraría igual,
// pero así el disco se libera en la misma pasada.
function pruneDms() {
  if (DM_RETENTION_DAYS > 0) {
    const cutoff = sqliteTimestamp(minutesAgo(DM_RETENTION_DAYS * 24 * 60));
    messages.pruneDmsOlderThan(cutoff).forEach(removeUploadFile);
  }
  messages.pruneDmPairs().forEach(removeUploadFile);
}

// Vence fotos por TTL y limpia archivos huérfanos. Devuelve cuántos borró.
function sweepPhotos() {
  let removed = 0;

  if (PHOTO_TTL_MINUTES > 0) {
    const cutoff = sqliteTimestamp(minutesAgo(PHOTO_TTL_MINUTES));
    for (const url of messages.expireImages(cutoff)) {
      if (removeUploadFile(url)) removed++;
    }
  }

  // Las fotos de perfil también cuentan: no tienen mensaje, y sin esto el barrido
  // las tomaría por huérfanas y las borraría a la hora de subirlas.
  const referenced = new Set([...messages.referencedImages(), ...users.avatarUrls()]);
  const orphanCutoffMs = minutesAgo(ORPHAN_GRACE_MINUTES).getTime();
  let files;
  try {
    files = fs.readdirSync(UPLOADS_DIR);
  } catch {
    return removed;
  }

  for (const file of files) {
    if (referenced.has(uploadUrl(file))) continue;
    try {
      const stat = fs.statSync(path.join(UPLOADS_DIR, file));
      // mtime, no created_at: el archivo puede no tener mensaje todavía
      if (!stat.isFile() || stat.mtimeMs > orphanCutoffMs) continue;
      fs.unlinkSync(path.join(UPLOADS_DIR, file));
      removed++;
    } catch {
      // borrado por otra pasada o sin permisos: seguimos
    }
  }

  // El barrido es el momento natural para poner en hora la cuenta del disco (ya
  // recorrimos el directorio) y soltar las cuotas de gente que ya no está.
  recalcUsage();
  pruneQuotas();

  return removed;
}

// Una pasada completa de mantenimiento. Los privados primero: si se podan, sus
// fotos quedan sin mensaje y el barrido que sigue las encuentra en la misma vuelta.
function sweep() {
  pruneDms();
  const removed = sweepPhotos();
  pruneConnections();
  return removed;
}

function startCleanupJobs() {
  // Bases que ya venían pasadas del límite (el historial previo a esta versión)
  messages.roomsWithMessages().forEach(pruneRoom);

  const removed = sweep();
  const usedMb = (usage() / 1024 / 1024).toFixed(1);
  console.log(
    `Limpieza: máx. ${messages.ROOM_HISTORY_LIMIT} mensajes por sala, ` +
      `privados ${DM_RETENTION_DAYS > 0 ? `${DM_RETENTION_DAYS} días` : 'sin vencimiento'} ` +
      `y máx. ${messages.DM_PAIR_LIMIT} por conversación, ` +
      `fotos ${PHOTO_TTL_MINUTES > 0 ? `${PHOTO_TTL_MINUTES} min` : 'sin TTL'}, ` +
      `disco ${usedMb} MB de ${DISK_LIMIT_MB > 0 ? `${DISK_LIMIT_MB} MB` : 'sin techo'}` +
      (removed ? ` — ${removed} archivo(s) borrados al arrancar` : '')
  );

  setInterval(sweep, SWEEP_INTERVAL_MS);
}

module.exports = { pruneRoom, sweep, sweepPhotos, startCleanupJobs, PHOTO_TTL_MINUTES };
