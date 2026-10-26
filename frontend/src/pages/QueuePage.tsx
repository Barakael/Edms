import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

type Doc = {
  id: number
  status: string
  registration?: { reference_number?: string; mail_subject_type?: string; sender_or_origin?: string }
  submitter?: { name: string }
}

export function QueuePage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ data: Doc[] }>('/documents/inbox?queue=1')
      .then((res) => setDocs(res.data || []))
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>
          Registry queue
        </h1>
        <p className="muted">Member submissions awaiting registry distribution.</p>
      </header>
      {error && <p className="error-text">{error}</p>}
      <div className="panel" style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Type</th>
              <th>From</th>
              <th>Submitted by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.registration?.reference_number || `Doc #${d.id}`}</td>
                <td>{d.registration?.mail_subject_type || '—'}</td>
                <td>{d.registration?.sender_or_origin || '—'}</td>
                <td>{d.submitter?.name || '—'}</td>
                <td>
                  <Link to={`/documents/${d.id}`}>Open & assign</Link>
                </td>
              </tr>
            ))}
            {!docs.length && (
              <tr>
                <td colSpan={5} className="muted">
                  Queue is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
