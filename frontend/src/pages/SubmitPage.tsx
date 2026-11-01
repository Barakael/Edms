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
  const [departments, setDepartments] = useState<Dept[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [comment, setComment] = useState('')
  const [hasFiles, setHasFiles] = useState(false)

  useEffect(() => {
    if (isStaff) return
    api<{ departments: Dept[] }>('/departments')
      .then((r) => setDepartments(r.departments || []))
      .catch(() => undefined)
  }, [isStaff])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const fd = new FormData(e.currentTarget)
    if (isStaff) {
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

  const title = isStaff ? 'Internal memo' : 'Submit document'
  const blurb = isStaff
    ? user?.hod_name
      ? `This internal memo goes to ${user.hod_name}, Head of Department${user.department_name ? ` for ${user.department_name}` : ''}. Use a comment and/or an attachment.`
      : 'This internal memo goes to your Head of Department. Your account needs a department and a Head of Department before it can be sent.'
    : 'Mail with no designated desk goes to the Preview Box for registry and senior managers.'

  const canSend = isStaff
    ? Boolean(user?.hod_name) && (comment.trim().length > 0 || hasFiles)
    : true

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
            <label htmlFor="mail_subject">{isStaff ? 'Memo subject' : 'Mail subject'}</label>
            <input id="mail_subject" name="mail_subject" required />
          </div>
          <div className="field">
            <label htmlFor="sender_or_origin">From</label>
            <input
              id="sender_or_origin"
              name="sender_or_origin"
              defaultValue={isStaff ? user?.name || '' : ''}
            />
          </div>
          {isStaff ? (
            <>
              <div className="field">
                <label>Department</label>
                <input value={user?.department_name || 'Not assigned'} readOnly />
              </div>
              <div className="field">
                <label>To</label>
                <input value={user?.hod_name || 'Head of Department not set'} readOnly />
              </div>
            </>
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
        </div>
        {!isStaff && <FilePicker />}
        <div className="field">
          <label htmlFor="comment">{isStaff ? 'Comment' : 'Comment for registry'}</label>
          <textarea
            id="comment"
            name="comment"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              isStaff ? 'Confirm something or ask the Head of Department to take action…' : undefined
            }
          />
        </div>
        <div className="field">
          <label htmlFor="files">Attachments</label>
          <input
            id="files"
            name="files[]"
            type="file"
            multiple
            accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setHasFiles(Boolean(e.target.files?.length))}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy || !canSend}>
          {busy ? 'Sending…' : isStaff ? 'Send memo' : 'Submit'}
        </button>
      </form>
    </div>
  )
}
