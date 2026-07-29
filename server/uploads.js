const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Mismo formato que genera multer y que valida el socket: /uploads/<archivo>
const UPLOAD_URL_RE = /^\/uploads\/([\w.-]+)$/;

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
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

module.exports = { UPLOADS_DIR, uploadUrl, removeUploadFile };
