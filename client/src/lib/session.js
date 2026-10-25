const KEY = 'chat_user';

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function setSession(data) {
  sessionStorage.setItem(KEY, JSON.stringify(data));
}

// Después de un cambio de seguridad (2FA, contraseña) el servidor cierra las demás
// sesiones y el token viejo deja de valer: sin guardar el nuevo, el próximo pedido
// (o reconexión) de esta pestaña nos sacaría.
export function replaceToken(token) {
  if (token) setSession({ ...getSession(), token });
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
}
