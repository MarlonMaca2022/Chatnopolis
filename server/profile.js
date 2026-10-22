// Datos de perfil que se muestran en la lista de conectados.

// Géneros aceptados. El cliente tiene su propia lista con los textos para mostrar
// (client/src/lib/gender.js); acá solo importa que el valor sea uno de estos: es
// lo que se guarda en la base y lo que viaja a todos en `roomUsers`.
const GENDERS = ['hombre', 'mujer', 'otro'];

const validGender = (value) => GENDERS.includes(value);

module.exports = { GENDERS, validGender };
