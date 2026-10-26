import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { StatusToast } from '../components/Toast'
import './InboxPage.css'

type Doc = {
  id: number
  status: string
  sensitivity: string
  updated_at: string
  registration?: {
    reference_number?: string
    mail_subject_type?: string
    sender_or_origin?: string
  }
  current_assignee?: { name: string }
}

export function InboxPage() {
  const { user } = useAuth()
  const [docs, setDocs] = useState<Doc[]>([])
  const [error, setError] = useState('')
  const isRegistrar = user?.role === 'registrar' || user?.role === 'admin'

  useEffect(() => {
    const q = isRegistrar ? '?all=1' : ''
    api<{ data: Doc[] }>(`/documents/inbox${q}`)
      .then((res) => setDocs(res.data || []))
      .catch((e) => setError(e.message))
  }, [isRegistrar])

  return (
    <div className="inbox-page">
      <StatusToast error={error} />
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>
          Documents
        </h1>
        <p className="muted">
          {isRegistrar ? 'All documents (registrar view).' : 'Documents assigned to you only.'}
        </p>
      </header>
      {error && <p className="error-text">{error}</p>}
      <div className="panel" style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Subject / type</th>
              <th>Sender</th>
              <th>Status</th>
              <th>Sensitivity</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.registration?.reference_number || `Doc #${d.id}`}</td>
                <td>{d.registration?.mail_subject_type || '—'}</td>
                <td>{d.registration?.sender_or_origin || '—'}</td>
                <td>
                  <span className={`badge ${d.status === 'closed' ? 'badge-closed' : ''}`}>
                    {d.status}
                  </span>
                </td>
                <td>
                  {d.sensitivity === 'bank_sensitive' ? (
                    <span className="badge badge-bank">bank</span>
                  ) : (
                    <span className="muted">normal</span>
                  )}
                </td>
                <td>
                  <Link to={`/documents/${d.id}`}>Open</Link>
                </td>
              </tr>
            ))}
            {!docs.length && (
              <tr>
                <td colSpan={6} className="muted inbox-empty">
                  No documents in inbox.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
