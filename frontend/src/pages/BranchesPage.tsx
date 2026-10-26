import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { StatusToast } from '../components/Toast'
import './directory.css'

type Branch = { id: number; name: string; active?: boolean }

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Branch | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await api<{ offices: Branch[] }>('/offices')
    setBranches(res.offices || [])
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

  function openEdit(branch: Branch) {
    setEditing(branch)
    setCreating(false)
    setName(branch.name)
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

  async function onDelete(branch: Branch) {
    if (!confirm(`Delete branch ${branch.name}? It will no longer be available for new users.`)) return
    setError('')
    try {
      await api(`/offices/${branch.id}`, { method: 'DELETE' })
      if (editing?.id === branch.id) setEditing(null)
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
          <h1>Branches</h1>
          <p className="muted">Headquarters and other branches. People are assigned to a branch when they are enrolled.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          Add branch
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
            {branches.length === 0 && (
              <tr>
                <td className="directory-empty" colSpan={2}>
                  No branches yet.
                </td>
              </tr>
            )}
            {branches.map((branch) => (
              <tr key={branch.id}>
                <td>{branch.name}</td>
                <td className="directory-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => openEdit(branch)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void onDelete(branch)}>
                    Delete
                  </button>
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
              <strong>{editing ? 'Edit branch' : 'Add branch'}</strong>
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
                <label htmlFor="branch-name">Branch name</label>
                <input id="branch-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            </div>
            <div className="directory-modal-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add branch'}
              </button>
              {editing && (
                <button type="button" className="btn btn-danger" onClick={() => void onDelete(editing)}>
                  Delete branch
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
