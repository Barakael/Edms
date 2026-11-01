import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { MailTable, type MailDoc } from '../components/MailTable'

const FIELDS = [
  { value: 'mail_type', label: 'Mail type' },
  { value: 'sender_or_origin', label: 'Mail from' },
  { value: 'mail_subject', label: 'Mail subject' },
  { value: 'file_number', label: 'File no.' },
  { value: 'received_date', label: 'Mail date' },
  { value: 'folio_number', label: 'Mail folio no.' },
  { value: 'mail_priority', label: 'Mail priority' },
  { value: 'volume', label: 'Volume' },
  { value: 'reference_number', label: 'Reference number' },
  { value: 'classification', label: 'Classification' },
  { value: 'department', label: 'Department name' },
]

export function SearchPage() {
  const [field, setField] = useState('file_number')
  const [q, setQ] = useState('')
  const [docs, setDocs] = useState<MailDoc[]>([])
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const params = new URLSearchParams({ field, q })
      const res = await api<{ data: MailDoc[] }>(`/documents/search?${params}`)
      setDocs(res.data || [])
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    }
  }

  return (
    <div className="inbox-page">
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>
          Trace mail movement
        </h1>
        <p className="muted">Find a document by the fields used to identify it.</p>
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
              Trace
            </button>
          </div>
        </div>
      </form>
      {error && <p className="error-text">{error}</p>}
      {searched && (
        <MailTable docs={docs} empty="No mail matches those details." showDepartment />
      )}
    </div>
  )
}
