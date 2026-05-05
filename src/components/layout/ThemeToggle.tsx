'use client';

import { useEffect, useState } from 'react';

/**
 * Sun/moon toggle that flips between dark (default) and light (cream) themes.
 * Persists preference to localStorage and applies `.light` class to <html>.
 */
export default function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  // Read persisted preference on mount
  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('light'));
  }, []);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    document.documentElement.classList.toggle('light', next);
    try { localStorage.setItem('atelier-theme', next ? 'light' : 'dark'); } catch {}
  }

  return (
    <button
      onClick={toggle}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: 'var(--p-border)',
        color: 'var(--p-muted)',
        background: 'transparent',
      }}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {isLight ? '☾' : '☀'}
    </button>
  );
}
