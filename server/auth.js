const jwt = require('jsonwebtoken');
const { users } = require('./db');

// El secreto con el que se firman los tokens de sesión. Quien lo conozca puede
// fabricarse un token que diga { role: 'admin' } y quedarse con el panel entero,
// así que acá NO hay valor por defecto silencioso: si falta, el servidor no arranca.
//
// El estricto es el modo por defecto a propósito. No preguntamos por
// NODE_ENV === 'production' porque nadie la setea en el VPS (pm2 arranca sin ella,
// ver DEPLOY.md) y el chequeo no protegería nada. Se relaja solo cuando algo dice
// explícitamente que es desarrollo — eso lo hace `npm run dev` vía nodemon.json.
const IS_DEV = process.env.NODE_ENV === 'development';
const DEV_SECRET = 'chatnopolis-solo-desarrollo-NO-usar-en-produccion';

// Valores que parecen un secreto pero no lo son: el ejemplo de DEPLOY.md copiado
// tal cual y el viejo default que estuvo publicado en el repo. Se rechazan siempre.
const NOT_SECRETS = new Set([
  DEV_SECRET,
  'una-cadena-larga-y-aleatoria-aqui',
  'chatnopolis-dev-secret-cambiar-en-produccion',
  'secret',
  'changeme',
]);

const MIN_SECRET_LENGTH = 32;

function resolveSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();

  if (secret && NOT_SECRETS.has(secret)) {
    fatal(
      `JWT_SECRET tiene un valor de ejemplo ("${secret}").`,
      'Ese valor es público: cualquiera podría firmar un token de admin.'
    );
  }

  if (!secret) {
    if (IS_DEV) {
      console.warn(
        '\n  Aviso: JWT_SECRET no está definida y estás en desarrollo, así que se usa\n' +
          '  un secreto fijo de prueba. En producción el servidor no arrancaría así.\n'
      );
      return DEV_SECRET;
    }
    fatal('Falta la variable de entorno JWT_SECRET.');
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    console.warn(
      `\n  Aviso: JWT_SECRET tiene ${secret.length} caracteres; se recomiendan al menos\n` +
        `  ${MIN_SECRET_LENGTH}. Generá una con: openssl rand -hex 32\n`
    );
  }

  return secret;
}

// Un secreto mal configurado no es algo de lo que el servidor pueda recuperarse:
// mejor no prender y que se note, que prender abierto y que no se note.
function fatal(problem, extra = '') {
  console.error(
    [
      '',
      '  No se puede arrancar Chatnopolis.',
      '',
      `  ${problem}`,
      ...(extra ? [`  ${extra}`] : []),
      '',
      '  Con ella se firman las sesiones. Sin un valor secreto y propio, cualquiera',
      '  puede fabricarse una sesión de administrador.',
      '',
      '  Cómo arreglarlo — generá una y ponela en el archivo .env de la raíz:',
      '',
      '      openssl rand -hex 32',
      '      echo "JWT_SECRET=<lo-que-imprimió>" >> .env',
      '',
      '  Si estás en tu máquina y no querés configurar nada, usá: npm run dev',
      '',
    ].join('\n')
  );
  process.exit(1);
}

const JWT_SECRET = resolveSecret();

// Cuánto vive un token. El del admin es corto porque es el que más vale robar: con
// él se modera, se banea y se ve la lista de cuentas. Doce horas cubren una jornada
// y obligan a pasar de nuevo por contraseña + código al día siguiente.
const TOKEN_TTL = { admin: '12h', user: '7d' };

// `sv` es la versión de sesión de la cuenta al momento de firmar (ver
// users.bumpSessionVersion): si después sube, este token deja de valer.
function signToken(user) {
  return jwt.sign(
    { username: user.username, role: user.role, sv: user.session_version },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL[user.role] || TOKEN_TTL.user }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET); // { username, role, sv, exp }
  } catch {
    return null;
  }
}

// Token -> { user, payload } con la fila FRESCA de la cuenta, o null. Que la firma
// sea válida no alcanza: la cuenta tiene que seguir existiendo y la versión de sesión
// tiene que coincidir. El rol se lee de la fila, nunca del token — un admin al que
// le sacaron el rol no lo conserva hasta que le venza la sesión.
// Los tokens anteriores a session_version no traen `sv` y no coinciden con nada:
// esas sesiones vuelven al login una vez, que es lo que se busca.
function sessionAccount(token) {
  const payload = token && verifyToken(token);
  if (!payload) return null;
  const user = users.findByNick(payload.username);
  if (!user || user.session_version !== payload.sv) return null;
  return { user, payload };
}

module.exports = { signToken, sessionAccount };
