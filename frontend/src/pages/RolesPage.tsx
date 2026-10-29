import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { IconButton, PenIcon, TrashIcon } from '../components/ActionIcons'
import { StatusToast } from '../components/Toast'
import './directory.css'

type RoleRow = {
  id: number
  value: string
  label: string
  description: string
  staff_count: number
}

export function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await api<{ roles: RoleRow[] }>('/roles')
    setRoles(res.roles || [])
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load roles'))
  }, [])

  function openEdit(role: RoleRow) {
    setEditing(role)
    setLabel(role.label)
    setDescription(role.description || '')
    setError('')
  }

  function closeModal() {
    setEditing(null)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      const res = await api<{ roles: RoleRow[] }>(`/roles/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ label, description }),
      })
      setRoles(res.roles || [])
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(role: RoleRow) {
    const staffNote =
      role.staff_count > 0
        ? ` This also deletes ${role.staff_count} staff member(s) with this role.`
        : ''
    if (!confirm(`Delete role “${role.label}”?${staffNote}`)) return
    setError('')
    try {
      const res = await api<{ roles: RoleRow[]; message?: string }>(`/roles/${role.id}`, {
        method: 'DELETE',
      })
      setRoles(res.roles || [])
      if (editing?.id === role.id) setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="directory-page">
      <header className="directory-header">
        <div>
          <h1>Roles</h1>
          <p className="muted">
            Roles control what staff can do. Assign a role when you add or edit someone under Staff.
          </p>
        </div>
        <Link className="btn btn-primary" to="/staff">
          Manage staff
        </Link>
      </header>
      <StatusToast error={error} />
      {error && !editing && <p className="error-text">{error}</p>}

      <div className="panel directory-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Key</th>
              <th>Description</th>
              <th>Active staff</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 && !error && (
              <tr>
                <td className="directory-empty" colSpan={5}>
                  Loading roles…
                </td>
              </tr>
            )}
            {roles.map((role) => (
              <tr key={role.id}>
                <td>{role.label}</td>
                <td>
                  <code>{role.value}</code>
                </td>
                <td>{role.description}</td>
                <td>{role.staff_count}</td>
                <td className="directory-actions">
                  <IconButton aria-label={`Edit ${role.label}`} title="Edit" onClick={() => openEdit(role)}>
                    <PenIcon />
                  </IconButton>
                  <IconButton
                    tone="danger"
                    aria-label={`Delete ${role.label}`}
                    title="Delete"
                    onClick={() => void onDelete(role)}
                  >
                    <TrashIcon />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="directory-backdrop" role="dialog" aria-modal="true">
          <form className="panel directory-modal" onSubmit={onSave}>
            <header className="directory-modal-head">
              <strong>Edit role</strong>
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
                <label htmlFor="role-label">Label</label>
                <input id="role-label" value={label} onChange={(e) => setLabel(e.target.value)} required />
              </div>
              <div className="field">
                <label>Key</label>
                <input value={editing.value} readOnly />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="role-description">Description</label>
                <textarea
                  id="role-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="directory-modal-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void onDelete(editing)}>
                Delete role
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
