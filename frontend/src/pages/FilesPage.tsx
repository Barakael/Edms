import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { IconButton, PenIcon, TrashIcon } from '../components/ActionIcons'
import { TablePager, usePagedRows } from '../components/TablePager'
import './directory.css'
import './InboxPage.css'

type Region = { id: number; name: string }
type Dept = { id: number; name: string; office_id?: number }

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
  closed_at?: string | null
  retrieved_at?: string | null
}

const emptyForm = {
  number: '',
  name: '',
  notes: '',
  office_id: '' as number | '',
  department_id: '' as number | '',
}

export function FilesPage() {
  const { user } = useAuth()
  const isRegistry = user?.role === 'registrar' || user?.role === 'admin'
  const isHod = user?.role === 'hod'
  const canManage = isRegistry || isHod
  const seesAll = isRegistry || user?.role === 'senior_manager'
  const [files, setFiles] = useState<RegistryFile[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [departments, setDepartments] = useState<Dept[]>([])
  const [status, setStatus] = useState<'all' | 'open' | 'archived'>('open')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RegistryFile | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function load() {
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    if (q.trim()) params.set('q', q.trim())
    const res = await api<{ files: RegistryFile[] }>(`/registry-files?${params}`)
    setFiles(res.files || [])
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load files'))
  }, [status])

  useEffect(() => {
    api<{ offices: Region[] }>('/offices')
      .then((r) => setRegions(r.offices || []))
      .catch(() => undefined)
    api<{ departments: Dept[] }>('/departments')
      .then((r) =>
        setDepartments(
          (r.departments || []).map((d) => ({
            ...d,
            id: Number(d.id),
            office_id: d.office_id == null ? undefined : Number(d.office_id),
          })),
        ),
      )
      .catch(() => undefined)
  }, [])

  function closeModal() {
    setCreating(false)
    setEditing(null)
    setForm(emptyForm)
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api('/registry-files', {
        method: 'POST',
        body: JSON.stringify({
          number: form.number,
          name: form.name,
          notes: form.notes || null,
          office_id: isHod ? null : form.office_id || null,
          department_id: isHod ? user?.department_id : form.department_id || null,
        }),
      })
      closeModal()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open file')
    } finally {
      setSaving(false)
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      await api(`/registry-files/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          number: form.number,
          name: form.name,
          notes: form.notes || null,
          office_id: isHod ? undefined : form.office_id || null,
          department_id: isHod ? undefined : form.department_id || null,
        }),
      })
      closeModal()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save file')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(file: RegistryFile) {
    const count = file.documents_count ?? 0
    if (count > 0) {
      setError(`File ${file.number} still has ${count} document(s). Clear them before deleting.`)
      return
    }
    if (!confirm(`Delete file ${file.number} — ${file.name}?`)) return
    setError('')
    try {
      await api(`/registry-files/${file.id}`, { method: 'DELETE' })
      if (editing?.id === file.id) closeModal()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const modalOpen = creating || editing !== null
  const { page, setPage, slice, total, pageSize } = usePagedRows(files)
  const regionDepartments = departments.filter(
    (d) => form.office_id !== '' && Number(d.office_id) === Number(form.office_id),
  )

  return (
    <div className="directory-page">
      <header className="directory-header">
        <div>
          <h1>Files</h1>
          <p className="muted">
            {seesAll
              ? 'All department files. Each file has a number and name and holds related mail.'
              : 'Files for your department. Open a file to see every document in it.'}
          </p>
        </div>
        {canManage && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setEditing(null)
              setForm({
                ...emptyForm,
                department_id: isHod ? user?.department_id || '' : '',
              })
              setCreating(true)
              setError('')
            }}
          >
            Register new file
          </button>
        )}
      </header>

      <form className="panel" style={{ padding: '0.85rem 1rem', marginBottom: '0.85rem' }} onSubmit={onSearch}>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label htmlFor="file-status">Status</label>
            <select
              id="file-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'all' | 'open' | 'archived')}
            >
              <option value="open">Open</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <label htmlFor="file-q">Search</label>
            <input
              id="file-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="File number or name"
            />
          </div>
          <button className="btn btn-secondary" type="submit">
            Find
          </button>
        </div>
      </form>

      {error && <p className="error-text">{error}</p>}

      <div className="panel mail-wrap">
        <div className="mail-scroll">
          <table className="table mail-table">
            <thead>
              <tr>
                <th>File no.</th>
                <th>File name</th>
                <th>Documents</th>
                <th>Status</th>
                {seesAll && <th>Department</th>}
                <th>Region</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {slice.map((file) => (
                <tr key={file.id}>
                  <td>{file.number}</td>
                  <td>{file.name}</td>
                  <td>{file.documents_count ?? 0}</td>
                  <td style={{ textTransform: 'capitalize' }}>{file.status}</td>
                  {seesAll && <td>{file.department?.name || '—'}</td>}
                  <td>{file.office?.name || '—'}</td>
                  <td>
                    <div className="directory-actions">
                      <Link to={`/files/${file.id}`}>Open</Link>
                      {canManage && (
                        <>
                          <IconButton
                            aria-label={`Edit ${file.number}`}
                            title="Edit"
                            onClick={() => {
                              setCreating(false)
                              setEditing(file)
                              setForm({
                                number: file.number,
                                name: file.name,
                                notes: file.notes || '',
                                office_id: file.office_id ?? '',
                                department_id: file.department_id ?? '',
                              })
                              setError('')
                            }}
                          >
                            <PenIcon />
                          </IconButton>
                          <IconButton
                            tone="danger"
                            aria-label={`Delete ${file.number}`}
                            title="Delete"
                            onClick={() => void onDelete(file)}
                          >
                            <TrashIcon />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!files.length && <p className="muted inbox-empty">No files yet.</p>}
        </div>
        <TablePager page={page} setPage={setPage} total={total} pageSize={pageSize} />
      </div>

      {modalOpen && (
        <div className="directory-backdrop" role="dialog" aria-modal="true">
          <form className="panel directory-modal" onSubmit={editing ? onSave : onCreate}>
            <header className="directory-modal-head">
              <strong>{editing ? 'Edit file details' : 'Open new file'}</strong>
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Close
              </button>
            </header>
            <div className="directory-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="field">
                <label htmlFor="file-number">File no.</label>
                <input
                  id="file-number"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="file-name">File name</label>
                <input
                  id="file-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              {isHod ? (
                <div className="field">
                  <label>Department</label>
                  <input value={user?.department_name || 'Your department'} readOnly />
                </div>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="file-region">Region</label>
                    <select
                      id="file-region"
                      value={form.office_id === '' ? '' : String(form.office_id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          office_id: e.target.value ? Number(e.target.value) : '',
                          department_id: '',
                        })
                      }
                      required
                    >
                      <option value="" disabled>
                        Select region
                      </option>
                      {regions.map((region) => (
                        <option key={region.id} value={String(region.id)}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="file-dept">Department</label>
                    <select
                      id="file-dept"
                      value={form.department_id === '' ? '' : String(form.department_id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          department_id: e.target.value ? Number(e.target.value) : '',
                        })
                      }
                      required
                    >
                      <option value="" disabled>
                        {regionDepartments.length ? 'Select department' : 'No departments in this region'}
                      </option>
                      {regionDepartments.map((dept) => (
                        <option key={dept.id} value={String(dept.id)}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="file-notes">Notes</label>
                <textarea
                  id="file-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              {error && <p className="error-text">{error}</p>}
            </div>
            <div className="directory-modal-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create file'}
              </button>
              {editing && (
                <IconButton
                  tone="danger"
                  aria-label="Delete file"
                  title="Delete"
                  disabled={saving}
                  onClick={() => void onDelete(editing)}
                >
                  <TrashIcon />
                </IconButton>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
