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

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5-2.5a1 1 0 1 1 0-2H21a1 1 0 1 1 0 2h-1.5ZM3 13a1 1 0 1 1 0-2h1.5a1 1 0 1 1 0 2H3Zm13.95 5.45a1 1 0 0 1 0-1.41l1.06-1.06a1 1 0 1 1 1.41 1.41l-1.06 1.06a1 1 0 0 1-1.41 0ZM4.58 6.02a1 1 0 0 1 1.41 0L7.05 7.08A1 1 0 0 1 5.64 8.5L4.58 7.43a1 1 0 0 1 0-1.41Zm12.73 0a1 1 0 0 1 1.41 0 1 1 0 0 1 0 1.41L17.66 8.5A1 1 0 1 1 16.25 7.1l1.06-1.07ZM5.64 15.5a1 1 0 0 1 1.41 1.41l-1.06 1.06a1 1 0 1 1-1.41-1.41L5.64 15.5ZM12 17a1 1 0 0 1 1 1v1.5a1 1 0 1 1-2 0V18a1 1 0 0 1 1-1Z"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M19.5 13.2A7.5 7.5 0 0 1 10.8 4.5a.75.75 0 0 0-.9-.97A8.75 8.75 0 1 0 20.47 14.1a.75.75 0 0 0-.97-.9Z"
      />
    </svg>
  )
}

export function ThemeToggle({
  className = '',
  variant = 'label',
}: {
  className?: string
  variant?: 'label' | 'icon'
}) {
  const theme = useTheme()
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const label = theme === 'dark' ? 'Light mode' : 'Dark mode'
  const aria = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`shell-icon-btn theme-toggle${className ? ` ${className}` : ''}`}
        aria-label={aria}
        title={label}
        onClick={() => applyTheme(next)}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`btn btn-secondary theme-toggle${className ? ` ${className}` : ''}`}
      aria-label={aria}
      onClick={() => applyTheme(next)}
    >
      {label}
    </button>
  )
}
