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
  login: (username, password) => request('/login', { method: 'POST', body: { username, password } }),
  register: (payload) => request('/register', { method: 'POST', body: payload }),
  createRoom: (name) => request('/rooms', { method: 'POST', body: { name } }),
  deleteRoom: (id) => request(`/rooms/${id}`, { method: 'DELETE' }),
  getUsers: () => request('/users'),
  unbanUser: (username) => request(`/users/${encodeURIComponent(username)}/unban`, { method: 'POST' }),
  unmuteUser: (username) => request(`/users/${encodeURIComponent(username)}/unmute`, { method: 'POST' }),
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
      headers: socketId ? { 'X-Socket-Id': socketId } : {},
    });
  },
};
