import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getAccessToken } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { FilePicker } from '../components/FilePicker'

type Dept = { id: number; name: string }

export function SubmitPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isStaff = user?.role === 'staff'
  const isStationSupervisor = user?.role === 'station_supervisor'
  const [departments, setDepartments] = useState<Dept[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [comment, setComment] = useState('')
  const [hasFiles, setHasFiles] = useState(false)

  useEffect(() => {
    if (isStaff || isStationSupervisor) return
    api<{ departments: Dept[] }>('/departments')
      .then((r) => setDepartments(r.departments || []))
      .catch(() => undefined)
  }, [isStaff, isStationSupervisor])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const fd = new FormData(e.currentTarget)
    if (isStationSupervisor) {
      fd.set('mail_type', 'MEMO')
      if (!comment.trim() && !hasFiles) {
        setError('Add a comment or attach a file for this internal memo.')
        setBusy(false)
        return
      }
    } else {
      fd.set('submit_to_registry', '1')
    }
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
      if (!res.ok) {
        const fieldError = data.errors && Object.values(data.errors)[0]
        const detail = Array.isArray(fieldError) ? fieldError[0] : null
        throw new Error(detail || data.message || 'Submit failed')
      }
      navigate(`/documents/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const title = isStationSupervisor ? 'Internal memo' : 'Submit document'
  const blurb = isStationSupervisor
    ? user?.hos_name
      ? `Send a memo to ${user.hos_name}, Head of Station${user.station_name ? ` for ${user.station_name}` : ''}. Use a comment and/or an attachment.`
      : 'Send a memo to your Head of Station. Your account needs a station and a Head of Station before it can be sent.'
    : isStaff
      ? user?.hod_name
        ? `This mail goes straight to ${user.hod_name}, Head of Department${user.department_name ? ` for ${user.department_name}` : ''}.`
        : 'This mail goes straight to your Head of Department. Your account needs a department and a Head of Department before it can be sent.'
      : 'Mail with no designated desk goes to the Preview Box for registry and senior managers.'

  const canSend = isStationSupervisor
    ? Boolean(user?.hos_name) && (comment.trim().length > 0 || hasFiles)
    : !(isStaff && !user?.hod_name)

  return (
    <div>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>
          {title}
        </h1>
        <p className="muted">{blurb}</p>
      </header>
      <form className="panel" style={{ padding: '1.25rem', maxWidth: 720 }} onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
          <div className="field">
            <label htmlFor="mail_subject">{isStationSupervisor ? 'Memo subject' : 'Mail subject'}</label>
            <input id="mail_subject" name="mail_subject" required />
          </div>
          <div className="field">
            <label htmlFor="sender_or_origin">From</label>
            <input
              id="sender_or_origin"
              name="sender_or_origin"
              defaultValue={isStationSupervisor || isStaff ? user?.name || '' : ''}
            />
          </div>
          {isStationSupervisor ? (
            <div className="field">
              <label>Station</label>
              <input value={user?.station_name || 'Not assigned'} readOnly />
            </div>
          ) : isStaff ? (
            <div className="field">
              <label>Department</label>
              <input value={user?.department_name || 'Not assigned'} readOnly />
            </div>
          ) : (
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
          )}
          {isStationSupervisor && (
            <div className="field">
              <label>To</label>
              <input value={user?.hos_name || 'Head of Station not set'} readOnly />
            </div>
          )}
        </div>
        {!isStationSupervisor && <FilePicker />}
        <div className="field">
          <label htmlFor="comment">
            {isStationSupervisor ? 'Comment' : isStaff ? 'Comment' : 'Comment for registry'}
          </label>
          <textarea
            id="comment"
            name="comment"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              isStationSupervisor
                ? 'Confirm something or ask the Head of Station to take action…'
                : undefined
            }
          />
        </div>
        <div className="field">
          <label htmlFor="files">{isStationSupervisor ? 'Attachment (optional if you wrote a comment)' : 'Files'}</label>
          <input
            id="files"
            name="files[]"
            type="file"
            multiple
            accept="application/pdf,image/*"
            required={!isStationSupervisor}
            onChange={(e) => setHasFiles((e.target.files?.length || 0) > 0)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy || !canSend}>
          {busy
            ? 'Submitting…'
            : isStationSupervisor
              ? 'Send to Head of Station'
              : isStaff
                ? 'Send to Head of Department'
                : 'Send to Preview Box'}
        </button>
      </form>
    </div>
  )
}
