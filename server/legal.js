// Versión vigente de los términos y edad mínima del servicio.
//
// El cliente NUNCA conoce esta versión: solo manda booleanos (`acceptedTerms: true`,
// `terms: true`) y el servidor estampa la versión que rige en ese momento. Así no hay
// una constante duplicada entre server/ y client/ que se pueda desincronizar, y quien
// decide qué texto se aceptó es siempre el servidor.
//
// Al cambiar el texto de los términos hay que SUBIR esta fecha: los registrados
// quedan con `terms_version` viejo y se les vuelve a pedir la aceptación en el
// próximo login (ver routes.js) y en la próxima reconexión (ver socket.js).
// Acordate de actualizar también `LEGAL.actualizado` en client/src/lib/legal.js,
// que es el texto que ve el usuario.
const TERMS_VERSION = '2026-10-22';

const MIN_AGE = 18;

// Un solo texto para los dos lugares que rechazan por falta de consentimiento.
// En tuteo, como el resto del flujo de consentimiento y las páginas legales: estos
// mensajes se muestran en el mismo cartel de error que los del cliente.
const CONSENT_REQUIRED = `Debes confirmar que tienes ${MIN_AGE} años o más y aceptar los Términos y la Política de Privacidad.`;

const TERMS_OUTDATED = 'Actualizamos los Términos. Vuelve a entrar para aceptarlos.';

module.exports = { TERMS_VERSION, MIN_AGE, CONSENT_REQUIRED, TERMS_OUTDATED };
