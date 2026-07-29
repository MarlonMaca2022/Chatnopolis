import { Moon, Sun } from 'lucide-react';
import { useTheme, toggleTheme } from '../lib/theme';

export default function ThemeToggle({ className = '' }) {
  const isDark = useTheme() === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={`text-ink-faint hover:text-accent transition ${className}`}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo nocturno'}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo nocturno'}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
