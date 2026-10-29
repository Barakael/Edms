import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { IconButton, PenIcon, TrashIcon } from '../components/ActionIcons'
import { TablePager, usePagedRows } from '../components/TablePager'
import './directory.css'
import './InboxPage.css'

type Region = { id: number; name: string }

type RegistryFile = {
  id: number
  number: string
  name: string
  status: string
  notes?: string | null
  office_id?: number | null
  documents_count?: number
  office?: { name: string } | null
  closed_at?: string | null
  retrieved_at?: string | null
}

const emptyForm = { number: '', name: '', notes: '', office_id: '' as number | '' }

export function FilesPage() {
  const { user } = useAuth()
  const isRegistry = user?.role === 'registrar' || user?.role === 'admin'
  const [files, setFiles] = useState<RegistryFile[]>([])
  const [regions, setRegions] = useState<Region[]>([])
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
          office_id: form.office_id || null,
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
          office_id: form.office_id || null,
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

  return (
    <div className="directory-page">
      <header className="directory-header">
        <div>
          <h1>Files</h1>
          <p className="muted">
            A file has a number and a name, and holds related mail. Open a file to see every document in it.
          </p>
        </div>
        {isRegistry && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setEditing(null)
              setForm(emptyForm)
              setCreating(true)
              setError('')
            }}
          >
            Open new file
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
                  <td>{file.office?.name || '—'}</td>
                  <td>
                    <div className="directory-actions">
                      <Link to={`/files/${file.id}`}>Open</Link>
                      {isRegistry && (
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
              <div className="field">
                <label htmlFor="file-region">Region</label>
                <select
                  id="file-region"
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
