import { useSyncExternalStore } from 'react'

export const THEME_KEY = 'edms-theme'
export type Theme = 'light' | 'dark'

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_KEY, theme)
  window.dispatchEvent(new Event('edms-theme'))
}

function subscribe(onChange: () => void) {
  window.addEventListener('edms-theme', onChange)
  return () => window.removeEventListener('edms-theme', onChange)
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => 'dark')
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useTheme()
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const label = theme === 'dark' ? 'Light mode' : 'Dark mode'

  return (
    <button
      type="button"
      className={`btn btn-secondary theme-toggle${className ? ` ${className}` : ''}`}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => applyTheme(next)}
    >
      {label}
    </button>
  )
}
