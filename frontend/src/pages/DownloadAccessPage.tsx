import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function DownloadAccessPage() {
  const { user, refreshMe } = useAuth()
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void refreshMe()
  }, [refreshMe])

  async function request(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api('/download-access/request', {
        method: 'POST',
        body: JSON.stringify({ notes }),
      })
      setMessage('Request submitted to registry.')
      setNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>Download access</h1>
      <p className="muted">
        Status:{' '}
        {user?.can_download ? (
          <span className="badge badge-closed">Granted</span>
        ) : (
          <span className="badge">Not granted</span>
        )}
      </p>
      {!user?.can_download && (
        <form className="panel" style={{ padding: '1rem' }} onSubmit={request}>
          <div className="field">
            <label htmlFor="notes">Reason (optional)</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          {error && <p className="error-text">{error}</p>}
          {message && <p style={{ color: 'var(--color-success)' }}>{message}</p>}
          <button className="btn btn-primary" type="submit">
            Request download privilege
          </button>
        </form>
      )}
    </div>
  )
}
