import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'

type Dept = { id: number; name: string; active: boolean; office_id: number; office?: { id: number; name: string } }
type Office = { id: number; name: string; departments: Dept[] }

export function DepartmentsPage() {
  const [offices, setOffices] = useState<Office[]>([])
  const [name, setName] = useState('')
  const [officeId, setOfficeId] = useState<number | ''>('')
  const [error, setError] = useState('')

  async function load() {
    const res = await api<{ offices: Office[] }>('/offices')
    setOffices(res.offices || [])
    if (!officeId && res.offices?.[0]) setOfficeId(res.offices[0].id)
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!officeId) return
    setError('')
    try {
      await api('/departments', {
        method: 'POST',
        body: JSON.stringify({ office_id: officeId, name }),
      })
      setName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>
          Departments
        </h1>
        <p className="muted">Managed list per office — used when registering documents.</p>
      </header>
      {error && <p className="error-text">{error}</p>}
      <form className="panel" style={{ padding: '1rem', marginBottom: '1rem', maxWidth: 520 }} onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="office">Office</label>
          <select
            id="office"
            value={officeId}
            onChange={(e) => setOfficeId(Number(e.target.value))}
            required
          >
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dept">Department name</label>
          <input id="dept" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <button className="btn btn-primary" type="submit">
          Add department
        </button>
      </form>
      {offices.map((o) => (
        <div key={o.id} className="panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>{o.name}</h3>
          <ul>
            {(o.departments || []).map((d) => (
              <li key={d.id}>
                {d.name} {!d.active && <span className="muted">(inactive)</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
