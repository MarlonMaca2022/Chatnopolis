import { useSyncExternalStore } from 'react';

const KEY = 'chatnopolis-theme';
const listeners = new Set();

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

// null = sin preferencia guardada, seguimos al sistema
function stored() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null; // modo privado / storage bloqueado
  }
}

function resolve() {
  return stored() || (systemQuery().matches ? 'dark' : 'light');
}

let current = resolve();

function apply(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function emit(theme) {
  current = theme;
  apply(theme);
  listeners.forEach((fn) => fn());
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // sin persistencia: el tema igual se aplica en esta sesión
  }
  emit(theme);
}

export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// El toggle pisa al sistema, pero mientras nadie lo haya tocado seguimos sus cambios
// (por ejemplo el modo nocturno automático del celular al anochecer).
systemQuery().addEventListener('change', () => {
  if (!stored()) emit(resolve());
});

// El tema real ya lo aplicó el script inline de index.html; esto solo lo confirma
apply(current);

export function useTheme() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => 'light' // sin DOM (no hay SSR acá, pero evita sorpresas)
  );
}
