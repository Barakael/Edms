import { useState, type FormEvent } from 'react'
import { api } from '../api/client'

type Props = {
  open: boolean
  onClose: () => void
  onVerified: (signToken: string) => void
}

export function OtpModal({ open, onClose, onVerified }: Props) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [debugCode, setDebugCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return null

  async function requestCode() {
    setBusy(true)
    setError('')
    try {
      const res = await api<{ message: string; debug_code?: string }>('/otp/sign/request', {
        method: 'POST',
        body: JSON.stringify({ channel }),
      })
      setSent(true)
      setDebugCode(res.debug_code || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP')
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api<{ sign_token: string }>('/otp/sign/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      onVerified(res.sign_token)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="otp-backdrop" role="dialog" aria-modal="true">
      <form className="panel otp-modal" onSubmit={verify}>
        <h3 style={{ marginTop: 0 }}>Verify to sign</h3>
        <p className="muted">Enter the one-time code (valid ~2 minutes).</p>
        <div className="field">
          <label htmlFor="channel">Send via</label>
          <select
            id="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as 'email' | 'sms')}
          >
            <option value="email">Email</option>
            <option value="sms">SMS (when enabled)</option>
          </select>
        </div>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void requestCode()}>
          {sent ? 'Resend code' : 'Send code'}
        </button>
        {debugCode && <p className="muted">Debug code: {debugCode}</p>}
        <div className="field">
          <label htmlFor="otp">Code</label>
          <input
            id="otp"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" type="submit" disabled={busy || !sent}>
            Verify
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
      <style>{`
        .otp-backdrop {
          position: fixed; inset: 0; background: rgba(4,8,16,.72);
          display: grid; place-items: center; z-index: 120; padding: 1rem;
        }
        .otp-modal { width: min(400px, 100%); padding: 1.25rem; }
      `}</style>
    </div>
  )
}
