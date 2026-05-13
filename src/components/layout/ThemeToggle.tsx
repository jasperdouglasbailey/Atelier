'use client';

import { useEffect, useState } from 'react';

/**
 * Sun/moon toggle that flips between light/cream (default) and dark themes.
 * Persists preference to localStorage and applies `.dark` class to <html>.
 */
export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('atelier-theme', next ? 'dark' : 'light'); } catch {}
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: 'var(--p-border)',
        color: 'var(--p-muted)',
        background: 'transparent',
      }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? '☀' : '☾'}
    </button>
  );
}
