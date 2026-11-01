import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { IconButton, PenIcon, TrashIcon } from '../components/ActionIcons'
import { MailTable, type MailDoc } from '../components/MailTable'
import './directory.css'

type Region = { id: number; name: string }

type RegistryFile = {
  id: number
  number: string
  name: string
  status: string
  notes?: string | null
  office_id?: number | null
  department_id?: number | null
  documents_count?: number
  office?: { name: string } | null
  department?: { name: string } | null
  creator?: { name: string } | null
  closed_at?: string | null
  retrieved_at?: string | null
}

export function FileDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isRegistry = user?.role === 'registrar' || user?.role === 'admin'
  const canManage = isRegistry || user?.role === 'hod'
  const showDepartment = isRegistry || user?.role === 'senior_manager' || user?.role === 'admin'
  const [file, setFile] = useState<RegistryFile | null>(null)
  const [docs, setDocs] = useState<MailDoc[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ number: '', name: '', notes: '', office_id: '' as number | '' })

  async function load() {
    const res = await api<{ file: RegistryFile; documents: MailDoc[] }>(`/registry-files/${id}`)
    setFile(res.file)
    setDocs(res.documents || [])
    setForm({
      number: res.file.number,
      name: res.file.name,
      notes: res.file.notes || '',
      office_id: res.file.office_id ?? '',
    })
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load file'))
    api<{ offices: Region[] }>('/offices')
      .then((r) => setRegions(r.offices || []))
      .catch(() => undefined)
  }, [id])

  async function archiveFile() {
    if (!file || !confirm(`Archive file ${file.number}? All open mail in it moves to the archive.`)) return
    setBusy(true)
    setError('')
    try {
      const res = await api<{ file: RegistryFile; documents: MailDoc[] }>(`/registry-files/${file.id}/archive`, {
        method: 'POST',
      })
      setFile(res.file)
      setDocs(res.documents || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed')
    } finally {
      setBusy(false)
    }
  }

  async function retrieveFile() {
    if (!file || !confirm(`Retrieve file ${file.number}? The file becomes open again with all of its documents.`)) return
    setBusy(true)
    setError('')
    try {
      const res = await api<{ file: RegistryFile; documents: MailDoc[] }>(`/registry-files/${file.id}/retrieve`, {
        method: 'POST',
      })
      setFile(res.file)
      setDocs(res.documents || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retrieve failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!file) return
    setSaving(true)
    setError('')
    try {
      const updated = await api<RegistryFile>(`/registry-files/${file.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          number: form.number,
          name: form.name,
          notes: form.notes || null,
          office_id: form.office_id || null,
        }),
      })
      setFile(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save file')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!file) return
    const count = file.documents_count ?? docs.length
    if (count > 0) {
      setError(`This file still has ${count} document(s). Clear them before deleting.`)
      return
    }
    if (!confirm(`Delete file ${file.number} — ${file.name}?`)) return
    setBusy(true)
    setError('')
    try {
      await api(`/registry-files/${file.id}`, { method: 'DELETE' })
      navigate('/files')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setBusy(false)
    }
  }

  if (!file && !error) {
    return <p className="muted">Loading file…</p>
  }

  if (!file) {
    return <p className="error-text">{error || 'File not found.'}</p>
  }

  return (
    <div className="directory-page">
      <header className="directory-header">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link to="/files">Files</Link> › {file.number}
          </p>
          <h1 style={{ marginTop: '0.35rem' }}>{file.name}</h1>
          <p className="muted">
            File no. {file.number}
            {' · '}
            <span style={{ textTransform: 'capitalize' }}>{file.status}</span>
            {' · '}
            {file.documents_count ?? docs.length} document{(file.documents_count ?? docs.length) === 1 ? '' : 's'}
            {file.department?.name ? ` · ${file.department.name}` : ''}
            {file.office?.name ? ` · ${file.office.name}` : ''}
          </p>
          {file.notes && <p className="muted">{file.notes}</p>}
        </div>
        {canManage && (
          <div className="directory-actions">
            <IconButton
              aria-label="Edit file details"
              title="Edit"
              disabled={busy}
              onClick={() => {
                setForm({
                  number: file.number,
                  name: file.name,
                  notes: file.notes || '',
                  office_id: file.office_id ?? '',
                })
                setEditing(true)
                setError('')
              }}
            >
              <PenIcon />
            </IconButton>
            <IconButton
              tone="danger"
              aria-label="Delete file"
              title="Delete"
              disabled={busy}
              onClick={() => void onDelete()}
            >
              <TrashIcon />
            </IconButton>
            {file.status === 'open' ? (
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void archiveFile()}>
                {busy ? 'Working…' : 'Archive file'}
              </button>
            ) : (
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void retrieveFile()}>
                {busy ? 'Working…' : 'Retrieve file'}
              </button>
            )}
          </div>
        )}
      </header>

      {error && <p className="error-text">{error}</p>}

      <MailTable docs={docs} empty="No documents in this file yet." showDepartment={showDepartment} />

      {editing && (
        <div className="directory-backdrop" role="dialog" aria-modal="true">
          <form className="panel directory-modal" onSubmit={onSave}>
            <header className="directory-modal-head">
              <strong>Edit file details</strong>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                Close
              </button>
            </header>
            <div className="directory-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="field">
                <label htmlFor="edit-file-number">File no.</label>
                <input
                  id="edit-file-number"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="edit-file-name">File name</label>
                <input
                  id="edit-file-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="edit-file-region">Region</label>
                <select
                  id="edit-file-region"
                  value={form.office_id}
                  onChange={(e) => setForm({ ...form, office_id: Number(e.target.value) })}
                  required
                >
                  <option value="" disabled>
                    Select region
                  </option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="edit-file-notes">Notes</label>
                <textarea
                  id="edit-file-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              {error && <p className="error-text">{error}</p>}
            </div>
            <div className="directory-modal-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <IconButton
                tone="danger"
                aria-label="Delete file"
                title="Delete"
                disabled={saving || busy}
                onClick={() => void onDelete()}
              >
                <TrashIcon />
              </IconButton>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
