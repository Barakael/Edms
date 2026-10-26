import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getAccessToken } from '../api/client'

type Dept = { id: number; name: string }

export function SubmitPage() {
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<Dept[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ departments: Dept[] }>('/departments')
      .then((r) => setDepartments(r.departments || []))
      .catch(() => undefined)
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const fd = new FormData(e.currentTarget)
    fd.set('submit_to_registry', '1')
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Submit failed')
      navigate(`/documents/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>
          Submit document
        </h1>
        <p className="muted">Sends to registry queue for distribution. Add an optional comment.</p>
      </header>
      <form className="panel" style={{ padding: '1.25rem', maxWidth: 720 }} onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
          <div className="field">
            <label htmlFor="mail_subject_type">Subject / type</label>
            <input id="mail_subject_type" name="mail_subject_type" required />
          </div>
          <div className="field">
            <label htmlFor="sender_or_origin">Sender / origin</label>
            <input id="sender_or_origin" name="sender_or_origin" />
          </div>
          <div className="field">
            <label htmlFor="department_id">Department</label>
            <select id="department_id" name="department_id" defaultValue="">
              <option value="">Select…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="comment">Comment for registry</label>
          <textarea id="comment" name="comment" rows={3} />
        </div>
        <div className="field">
          <label htmlFor="files">Files</label>
          <input id="files" name="files[]" type="file" multiple accept="application/pdf,image/*" required />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit to registry'}
        </button>
      </form>
    </div>
  )
}
