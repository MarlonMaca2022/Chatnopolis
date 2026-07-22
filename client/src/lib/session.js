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

export function clearSession() {
  sessionStorage.removeItem(KEY);
}
