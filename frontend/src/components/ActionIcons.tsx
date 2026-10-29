import type { ButtonHTMLAttributes } from 'react'

export function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
      />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"
      />
    </svg>
  )
}

type IconBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'neutral' | 'danger'
}

export function IconButton({ tone = 'neutral', className = '', children, ...props }: IconBtnProps) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-${tone}${className ? ` ${className}` : ''}`}
      {...props}
    >
      {children}
    </button>
  )
}
