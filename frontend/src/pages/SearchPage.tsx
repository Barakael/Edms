import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

const FIELDS = [
  { value: 'reference_number', label: 'Reference number' },
  { value: 'file_number', label: 'File number' },
  { value: 'folio_number', label: 'Folio number' },
  { value: 'mail_subject_type', label: 'Mail / subject type' },
  { value: 'sender_or_origin', label: 'Sender / origin' },
  { value: 'received_date', label: 'Received date' },
  { value: 'classification', label: 'Classification' },
  { value: 'department', label: 'Department name' },
  { value: 'department_id', label: 'Department ID' },
]

type Doc = {
  id: number
  status: string
  registration?: Record<string, string>
}

export function SearchPage() {
  const [field, setField] = useState('reference_number')
  const [q, setQ] = useState('')
  const [docs, setDocs] = useState<Doc[]>([])
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const params = new URLSearchParams({ field, q })
      const res = await api<{ data: Doc[] }>(`/documents/search?${params}`)
      setDocs(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    }
  }

  return (
    <div>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>
          Search
        </h1>
        <p className="muted">Filter by any one registration field.</p>
      </header>
      <form className="panel" style={{ padding: '1rem', marginBottom: '1rem' }} onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem' }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="field">Field</label>
            <select id="field" value={field} onChange={(e) => setField(e.target.value)}>
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="q">Value</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} required />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <button className="btn btn-primary" type="submit">
              Search
            </button>
          </div>
        </div>
      </form>
      {error && <p className="error-text">{error}</p>}
      <div className="panel" style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Reference</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.id}</td>
                <td>{d.registration?.reference_number || '—'}</td>
                <td>
                  <span className="badge">{d.status}</span>
                </td>
                <td>
                  <Link to={`/documents/${d.id}`}>Open</Link>
                </td>
              </tr>
            ))}
            {!docs.length && (
              <tr>
                <td colSpan={4} className="muted">
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
