const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'chatnopolis-dev-secret-cambiar-en-produccion';
const TOKEN_TTL = '7d';

function signToken(user) {
  return jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET); // { username, role }
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken };
