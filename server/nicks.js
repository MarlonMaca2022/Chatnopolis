// Forma canónica de un nombre de usuario o nick de invitado.
//
// TODA comparación de identidad pasa por acá: colisión entre invitados en línea,
// colisión de un invitado con un usuario registrado, bans de invitado y registro.
// Sin esto "María", "MARIA" y "Maria  " son tres identidades distintas, y con eso
// alcanza para suplantar a otro (entrar como "Admin") o evadir un ban cambiando
// una tilde — SQLite compara TEXT byte a byte, así que `=` no las une.
//
// NFD separa la tilde de la letra y \p{M} borra esas marcas sueltas: María -> Maria.
// Los espacios se quitan enteros, no se colapsan: si no, "M aria" seguiría siendo
// una identidad distinta de "Maria" y la suplantación queda abierta. El nombre que
// se muestra es siempre `username`, así que el usuario no pierde sus espacios.
function canonicalNick(nick) {
  if (typeof nick !== 'string') return '';
  return nick
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

module.exports = { canonicalNick };
