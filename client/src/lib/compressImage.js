// Reduce la foto en el navegador antes de subirla: una foto de celular pasa de
// varios MB a unos cientos de KB. Si algo falla, devolvemos el archivo original
// (el servidor sigue validando tipo y límite de 5 MB).

const MAX_DIMENSION = 1600; // lado mayor, en píxeles
const QUALITY = 0.82;

export async function compressImage(file, { maxDimension = MAX_DIMENSION, quality = QUALITY } = {}) {
  // Los GIF perderían la animación al pasar por canvas: van tal cual.
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

  const bitmap = await decode(file);
  if (!bitmap) return file;

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  // webp conserva transparencia y pesa menos; jpeg como respaldo (Safari viejo)
  const blob = (await toBlob(canvas, 'image/webp', quality)) || (await toBlob(canvas, 'image/jpeg', quality));
  if (!blob || blob.size >= file.size) return file; // ya venía optimizada

  const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + ext, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

// imageOrientation respeta el EXIF (fotos de celular rotadas). Si el navegador no
// acepta las opciones, reintentamos sin ellas.
async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

// toBlob cae a png cuando no soporta el tipo pedido, por eso comprobamos blob.type
function toBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality);
  });
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
