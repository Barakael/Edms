import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import './Toast.css'

type Tone = 'info' | 'success' | 'error' | 'warning'

type ToastItem = {
  id: number
  message: string
  tone: Tone
}

type Push = (message: string, tone?: Tone) => void

const ToastContext = createContext<Push>(() => {})

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const push = useCallback<Push>((message, tone = 'info') => {
    const text = message.trim()
    if (!text) return
    const id = nextId++
    setToasts((current) => [...current.slice(-3), { id, message: text, tone }])
    window.setTimeout(() => dismiss(id), 4600)
  }, [dismiss])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.tone}`}
            role={t.tone === 'error' || t.tone === 'warning' ? 'alert' : 'status'}
          >
            <p>{t.message}</p>
            <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

/** Mirrors an existing error or success string into the floating toast. */
export function StatusToast({
  error,
  success,
  info,
}: {
  error?: string
  success?: string
  info?: string
}) {
  const push = useToast()
  const seen = useRef('')

  useEffect(() => {
    if (!error && !success && !info) {
      seen.current = ''
      return
    }
    const message = error || success || info || ''
    const tone: Tone = error ? 'error' : success ? 'success' : 'info'
    const key = `${tone}:${message}`
    if (key === seen.current) return
    seen.current = key
    push(message, tone)
  }, [error, success, info, push])

  return null
}
