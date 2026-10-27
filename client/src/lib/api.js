import { getSession } from './session';

async function request(path, options = {}) {
  const session = getSession();
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Error de conexión con el servidor');
  return data;
}

export const api = {
  getRooms: () => request('/rooms'),
  // acceptedTerms solo hace falta cuando el servidor pidió re-aceptar los términos
  // (respuesta con termsOutdated), y code cuando pidió el segundo factor (needsCode).
  // En un login normal los dos viajan como undefined.
  login: (username, password, acceptedTerms, code) =>
    request('/login', { method: 'POST', body: { username, password, acceptedTerms, code } }),
  get2fa: () => request('/2fa'),
  setup2fa: () => request('/2fa/setup', { method: 'POST' }),
  // Activar o desactivar el 2FA cierra las demás sesiones de la cuenta y devuelve un
  // token nuevo. socketId es la conexión de esta pestaña, la única que sigue abierta.
  enable2fa: (password, code, socketId) =>
    request('/2fa/enable', { method: 'POST', body: { password, code }, headers: socketHeader(socketId) }),
  disable2fa: (password, code, socketId) =>
    request('/2fa/disable', { method: 'POST', body: { password, code }, headers: socketHeader(socketId) }),
  revokeSessions: () => request('/sessions/revoke', { method: 'POST' }),
  // Igual que el 2FA: cierra las demás sesiones y devuelve un token nuevo para esta.
  // code solo hace falta si la cuenta tiene la verificación en dos pasos activa.
  changePassword: (currentPassword, newPassword, code, socketId) =>
    request('/password', {
      method: 'POST',
      body: { currentPassword, newPassword, code },
      headers: socketHeader(socketId),
    }),
  // Mi perfil de una cuenta registrada (el invitado lo cambia por el socket)
  getProfile: () => request('/profile'),
  updateProfile: (gender) => request('/profile', { method: 'PATCH', body: { gender } }),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('photo', file);
    return request('/profile/avatar', { method: 'POST', body: form });
  },
  removeAvatar: () => request('/profile/avatar', { method: 'DELETE' }),
  register: (payload) => request('/register', { method: 'POST', body: payload }),
  createRoom: (name) => request('/rooms', { method: 'POST', body: { name } }),
  deleteRoom: (id) => request(`/rooms/${id}`, { method: 'DELETE' }),
  getStats: () => request('/stats'),
  getUsers: () => request('/users'),
  unbanUser: (username) => request(`/users/${encodeURIComponent(username)}/unban`, { method: 'POST' }),
  unmuteUser: (username) => request(`/users/${encodeURIComponent(username)}/unmute`, { method: 'POST' }),
  resetPassword: (username, newPassword, adminPassword, code) =>
    request(`/users/${encodeURIComponent(username)}/password`, {
      method: 'POST',
      body: { newPassword, adminPassword, code },
    }),
  getGuestBans: () => request('/guest-bans'),
  unbanGuest: (username) => request(`/guest-bans/${encodeURIComponent(username)}`, { method: 'DELETE' }),
  // socketId identifica la sesión viva del que sube. Es la credencial de los
  // invitados, que no tienen cuenta ni token (ver requireChatSession en el servidor).
  uploadPhoto: (file, socketId) => {
    const form = new FormData();
    form.append('photo', file);
    return request('/upload', {
      method: 'POST',
      body: form,
      headers: socketHeader(socketId),
    });
  },
};

function socketHeader(socketId) {
  return socketId ? { 'X-Socket-Id': socketId } : {};
}
