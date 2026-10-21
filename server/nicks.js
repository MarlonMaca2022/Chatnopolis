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

// Nombres que nadie puede tomar como invitado ni registrar: suenan a staff y
// servirían para hacerse pasar por moderación. Se compara la canónica y por
// "contiene", así "El Admin", "ADMÍN_oficial" o "soporte-chatnopolis" también
// quedan afuera. Las palabras cortas que aparecen dentro de nombres comunes
// ("mod" en "modesto") van aparte y solo cuentan si son el nombre entero.
// No afecta a cuentas que ya existen: el admin real se llama como quiera.
const RESERVED_WORDS = ['admin', 'moderador', 'soporte', 'staff', 'chatnopolis', 'sistema'];
const RESERVED_EXACT = ['mod', 'root'];

function isReservedNick(nick) {
  const canon = canonicalNick(nick);
  return RESERVED_EXACT.includes(canon) || RESERVED_WORDS.some((word) => canon.includes(word));
}

module.exports = { canonicalNick, isReservedNick };
