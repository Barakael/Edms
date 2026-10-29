import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAccessToken, api } from '../api/client'
import { FilePicker } from '../components/FilePicker'
import './RegisterPage.css'

type Dept = { id: number; name: string; station?: { name: string } | null }
type Person = { id: number; name: string; role: string }

export function RegisterPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [departments, setDepartments] = useState<Dept[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [destination, setDestination] = useState<'inbox' | 'archive'>('inbox')

  useEffect(() => {
    api<{ departments: Dept[] }>('/departments')
      .then((r) => setDepartments(r.departments || []))
      .catch(() => undefined)
    api<{ users: Person[] }>('/users/assignees')
      .then((r) => setPeople(r.users || []))
      .catch(() => undefined)
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set('destination', destination)
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
    <div className="register-page">
      <header className="register-header">
        <div>
          <h1>Register Mail</h1>
          <p className="muted">Record the mail, choose where it goes, then attach the scan.</p>
        </div>
      </header>

      <form className="panel register-form" onSubmit={onSubmit}>
        <div className="register-columns">
          <section className="register-section">
            <h2>Mail</h2>
            <div className="register-fields two">
              <div className="field span-2">
                <label htmlFor="mail_subject">Mail subject</label>
                <input id="mail_subject" name="mail_subject" required />
              </div>
              <div className="field">
                <label htmlFor="mail_type">Mail type</label>
                <input id="mail_type" name="mail_type" placeholder="LETTER, INVOICE, …" />
              </div>
              <div className="field">
                <label htmlFor="received_date">Mail date</label>
                <input id="received_date" name="received_date" type="date" />
              </div>
              <div className="field span-2">
                <label htmlFor="sender_or_origin">Mail from</label>
                <input id="sender_or_origin" name="sender_or_origin" />
              </div>
              <div className="field">
                <label htmlFor="folio_number">Folio no.</label>
                <input id="folio_number" name="folio_number" />
              </div>
              <div className="field">
                <label htmlFor="mail_priority">Priority</label>
                <select id="mail_priority" name="mail_priority" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="very_urgent">Very urgent</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="volume">Volume</label>
                <input id="volume" name="volume" />
              </div>
              <div className="field">
                <label htmlFor="reference_number">Reference number</label>
                <input id="reference_number" name="reference_number" />
              </div>
              <div className="field">
                <label htmlFor="classification">Classification</label>
                <input id="classification" name="classification" />
              </div>
            </div>
          </section>

          <section className="register-section register-routing">
            <h2>Routing</h2>
            <div className="register-fields">
              <div className="field">
                <label htmlFor="department_id">Department</label>
                <select id="department_id" name="department_id" defaultValue="">
                  <option value="">Select…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.station?.name ? `${d.name} · ${d.station.name}` : d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sensitivity">Sensitivity</label>
                <select id="sensitivity" name="sensitivity" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="sensitive">Sensitive</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="destination">Destination</label>
                <select
                  id="destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value as 'inbox' | 'archive')}
                >
                  <option value="inbox">Inbox for processing</option>
                  <option value="archive">Straight to archive</option>
                </select>
              </div>
              {destination === 'inbox' && (
                <div className="field">
                  <label htmlFor="assignee_id">Inbox of</label>
                  <select id="assignee_id" name="assignee_id" required defaultValue="">
                    <option value="" disabled>
                      Select person
                    </option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} ({person.role.replaceAll('_', ' ')})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="register-section register-file">
          <h2>File</h2>
          <div className="register-file-grid">
            <FilePicker />
            <div className="field register-attach">
              <label htmlFor="files">Attach file</label>
              <input id="files" name="files[]" type="file" multiple accept="application/pdf,image/*" />
            </div>
          </div>
        </section>

        <div className="register-actions">
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : destination === 'archive' ? 'Register into archive' : 'Register into inbox'}
          </button>
        </div>
      </form>
    </div>
  )
}
