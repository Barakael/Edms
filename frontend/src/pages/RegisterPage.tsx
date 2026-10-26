import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAccessToken, api } from '../api/client'

type Dept = { id: number; name: string }

export function RegisterPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [departments, setDepartments] = useState<Dept[]>([])

  useEffect(() => {
    api<{ departments: Dept[] }>('/departments')
      .then((r) => setDepartments(r.departments || []))
      .catch(() => undefined)
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const form = e.currentTarget
    const fd = new FormData(form)
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
      if (!res.ok) throw new Error(data.message || 'Registration failed')
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
          Register document
        </h1>
        <p className="muted">Registrar enrollment with department from managed list.</p>
      </header>
      <form className="panel" style={{ padding: '1.25rem', maxWidth: 720 }} onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
          {(
            [
              ['mail_subject_type', 'Mail / subject type'],
              ['reference_number', 'Reference number'],
              ['file_number', 'File number'],
              ['folio_number', 'Folio number'],
              ['sender_or_origin', 'Sender / origin'],
              ['received_date', 'Received date', 'date'],
              ['classification', 'Classification'],
            ] as const
          ).map(([name, label, type]) => (
            <div className="field" key={name}>
              <label htmlFor={name}>{label}</label>
              <input id={name} name={name} type={type || 'text'} />
            </div>
          ))}
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
          <div className="field">
            <label htmlFor="sensitivity">Sensitivity</label>
            <select id="sensitivity" name="sensitivity" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="bank_sensitive">Bank sensitive</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue="registered">
              <option value="draft">Draft</option>
              <option value="registered">Registered</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="files">Files (PDF / images)</label>
          <input id="files" name="files[]" type="file" multiple accept="application/pdf,image/*" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save document'}
        </button>
      </form>
    </div>
  )
}
