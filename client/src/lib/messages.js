// Los mismos que acepta el servidor (REACTIONS en server/socket.js): cualquier otro
// lo descarta.
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// Texto de una cita, venga del servidor ({ text, photo, deleted }) o de un mensaje
// completo que se está por responder.
export function quoteLabel(quote) {
  if (quote.deleted) return 'Mensaje eliminado';
  if (quote.text) return quote.text;
  if (quote.photo || quote.imageUrl || quote.imageExpired) return '📷 Foto';
  return '';
}
