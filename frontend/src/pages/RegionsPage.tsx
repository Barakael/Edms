import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { IconButton, PenIcon, TrashIcon } from '../components/ActionIcons'
import { StatusToast } from '../components/Toast'
import './directory.css'

type Region = { id: number; name: string; active?: boolean }

export function RegionsPage() {
  const [regions, setRegions] = useState<Region[]>([])
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Region | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await api<{ offices: Region[] }>('/offices')
    setRegions(res.offices || [])
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])

  function openCreate() {
    setCreating(true)
    setEditing(null)
    setName('')
    setError('')
  }

  function openEdit(region: Region) {
    setEditing(region)
    setCreating(false)
    setName(region.name)
    setError('')
  }

  function closeModal() {
    setCreating(false)
    setEditing(null)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api('/offices', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setName('')
      setCreating(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      await api(`/offices/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      })
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(region: Region) {
    if (!confirm(`Delete region ${region.name}? It will no longer be available for new users.`)) return
    setError('')
    try {
      await api(`/offices/${region.id}`, { method: 'DELETE' })
      if (editing?.id === region.id) setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const modalOpen = creating || editing !== null

  return (
    <div className="directory-page">
      <header className="directory-header">
        <div>
          <h1>Regions</h1>
          <p className="muted">Headquarters and other regions. People are assigned to a region when they are enrolled.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          Add region
        </button>
      </header>
      <StatusToast error={error} />
      {error && !modalOpen && <p className="error-text">{error}</p>}

      <div className="panel directory-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {regions.length === 0 && (
              <tr>
                <td className="directory-empty" colSpan={2}>
                  No regions yet.
                </td>
              </tr>
            )}
            {regions.map((region) => (
              <tr key={region.id}>
                <td>{region.name}</td>
                <td className="directory-actions">
                  <IconButton aria-label={`Edit ${region.name}`} title="Edit" onClick={() => openEdit(region)}>
                    <PenIcon />
                  </IconButton>
                  <IconButton
                    tone="danger"
                    aria-label={`Delete ${region.name}`}
                    title="Delete"
                    onClick={() => void onDelete(region)}
                  >
                    <TrashIcon />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="directory-backdrop" role="dialog" aria-modal="true">
          <form className="panel directory-modal" onSubmit={editing ? onSaveEdit : onCreate}>
            <header className="directory-modal-head">
              <strong>{editing ? 'Edit region' : 'Add region'}</strong>
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Close
              </button>
            </header>
            {error && (
              <p className="error-text" style={{ margin: '1rem 1rem 0' }}>
                {error}
              </p>
            )}
            <div className="directory-grid">
              <div className="field">
                <label htmlFor="region-name">Region name</label>
                <input id="region-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            </div>
            <div className="directory-modal-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add region'}
              </button>
              {editing && (
                <button type="button" className="btn btn-danger" onClick={() => void onDelete(editing)}>
                  Delete region
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
