import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

type Draft = {
  id: number
  status: string
  document_id: number
  message?: { subject?: string; from_address?: string; received_at?: string }
}

export function EmailDraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [error, setError] = useState('')

  async function load() {
    const res = await api<{ data: Draft[] }>('/email-drafts')
    setDrafts(res.data || [])
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])

  async function claim(id: number) {
    try {
      const res = await api<{ document_id: number }>(`/email-drafts/${id}/claim`, { method: 'POST' })
      await load()
      if (res.document_id) window.location.href = `/documents/${res.document_id}`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Claim failed')
    }
  }

  return (
    <div>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>
          Email drafts
        </h1>
        <p className="muted">Inbound mail to info@… lands here before workflow entry.</p>
      </header>
      {error && <p className="error-text">{error}</p>}
      <div className="panel" style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>From</th>
              <th>Subject</th>
              <th>Received</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id}>
                <td>{d.message?.from_address || '—'}</td>
                <td>{d.message?.subject || '—'}</td>
                <td>{d.message?.received_at ? new Date(d.message.received_at).toLocaleString() : '—'}</td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-primary" onClick={() => void claim(d.id)}>
                    Claim
                  </button>
                  <Link to={`/documents/${d.document_id}`}>Open draft</Link>
                </td>
              </tr>
            ))}
            {!drafts.length && (
              <tr>
                <td colSpan={4} className="muted">
                  No pending email drafts. New mail to the registry inbox will appear here for claim.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
