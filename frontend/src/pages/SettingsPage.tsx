import { useEffect, useState, type FormEvent } from 'react'
import { api, type User } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { StatusToast } from '../components/Toast'
import './SettingsPage.css'

export function SettingsPage() {
  const { user, setUser, refreshMe } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [twoFa, setTwoFa] = useState(Boolean(user?.signature_2fa_enabled))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTwoFa(Boolean(user?.signature_2fa_enabled))
  }, [user?.signature_2fa_enabled])

  if (!user) return <p className="muted">Loading…</p>

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (password !== passwordConfirmation) {
      setError('New passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const res = await api<{ user: User }>('/auth/settings', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: currentPassword,
          password,
          password_confirmation: passwordConfirmation,
        }),
      })
      setUser(res.user)
      setCurrentPassword('')
      setPassword('')
      setPasswordConfirmation('')
      setMessage('Password updated.')
      await refreshMe()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  async function toggleTwoFa(enabled: boolean) {
    setError('')
    setMessage('')
    setTwoFa(enabled)
    setBusy(true)
    try {
      const res = await api<{ user: User }>('/auth/settings', {
        method: 'PUT',
        body: JSON.stringify({ signature_2fa_enabled: enabled }),
      })
      setUser(res.user)
      setTwoFa(Boolean(res.user.signature_2fa_enabled))
      setMessage(
        enabled
          ? 'Signature 2FA enabled — OTP required before placing a signature.'
          : 'Signature 2FA disabled — you can sign documents directly.',
      )
    } catch (err) {
      setTwoFa(!enabled)
      setError(err instanceof Error ? err.message : 'Could not update 2FA setting')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Profile, password, and signature security.</p>
        </div>
        <StatusToast error={error} success={message} />
        {(error || message) && (
          <div className="settings-status">
            {error && <p className="error-text">{error}</p>}
            {message && <p className="settings-ok">{message}</p>}
          </div>
        )}
      </header>

      <div className="settings-top">
        <section className="panel settings-panel">
          <h3>Profile</h3>
          <dl className="settings-profile">
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{user.phone || '—'}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user.role.replace(/_/g, ' ')}</dd>
            </div>
          </dl>
          <p className="muted settings-note">Managed by registry — view only.</p>
        </section>

        <form className="panel settings-panel" onSubmit={savePassword}>
          <h3>Change password</h3>
          <div className="field">
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="settings-pw-row">
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirm</label>
              <input
                id="confirm-password"
                type="password"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Update password
          </button>
        </form>
      </div>

      <section className="panel settings-panel settings-security">
        <div className="settings-security-copy">
          <h3>Signature security</h3>
          <p className="muted settings-note">
            When enabled, placing a signature requires a one-time code. When disabled, you can sign
            directly.
          </p>
        </div>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={twoFa}
            disabled={busy}
            onChange={(e) => void toggleTwoFa(e.target.checked)}
          />
          <span>
            <strong>Enable 2FA in signatures</strong>
            <span className="muted">{twoFa ? 'OTP required to sign' : 'Direct signing allowed'}</span>
          </span>
        </label>
      </section>
    </div>
  )
}
