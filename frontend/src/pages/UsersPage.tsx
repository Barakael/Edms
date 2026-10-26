import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { StatusToast } from '../components/Toast'
import './UsersPage.css'

type U = {
  id: number
  name: string
  email: string
  phone?: string | null
  role: string
  active: boolean
}

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'action_officer',
  password: '',
}

export function UsersPage() {
  const [users, setUsers] = useState<U[]>([])
  const [error, setError] = useState('')
  const [tempPw, setTempPw] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<U | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'action_officer',
    password: '',
    active: true,
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await api<{ users: U[] }>('/registry/users')
    setUsers((res.users || []).filter((u) => u.active !== false || !u.name.includes('(deleted)')))
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    setTempPw('')
    try {
      const payload: Record<string, string> = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
      }
      if (form.password) payload.password = form.password
      const res = await api<{ temporary_password: string }>('/registry/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setTempPw(res.temporary_password)
      setForm(emptyForm)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  function openEdit(u: U) {
    setEditing(u)
    setEditForm({
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      password: '',
      active: u.active,
    })
    setError('')
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      const body: Record<string, string | boolean> = {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
        active: editForm.active,
      }
      if (editForm.password.trim()) body.password = editForm.password.trim()
      await api(`/registry/users/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(u: U) {
    if (!confirm(`Delete user ${u.name}? They will be deactivated and cannot sign in.`)) return
    setError('')
    try {
      await api(`/registry/users/${u.id}`, { method: 'DELETE' })
      if (editing?.id === u.id) setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const visible = users.filter((u) => u.active && !u.name.endsWith('(deleted)'))

  return (
    <div className="users-page">
      <header className="users-header">
        <h1>Users</h1>
        <p className="muted">Registry creates and manages accounts. Download access is granted per document.</p>
      </header>
      <StatusToast error={error} />
      {error && <p className="error-text">{error}</p>}
      {tempPw && <p className="users-temp-pw">Temporary password: {tempPw}</p>}

      <form className="panel users-create" onSubmit={onCreate}>
        <h3>Create user</h3>
        <div className="users-grid">
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="member">Member</option>
              <option value="action_officer">Action officer</option>
              <option value="director">Director</option>
              <option value="registrar">Registrar</option>
            </select>
          </div>
          <div className="field">
            <label>Password (optional)</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Auto-generated if empty"
              minLength={8}
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit">
          Create user
        </button>
      </form>

      <div className="panel users-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td>{u.role}</td>
                <td className="users-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => openEdit(u)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void onDelete(u)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="users-edit-backdrop" role="dialog" aria-modal="true">
          <form className="panel users-edit-modal" onSubmit={onSaveEdit}>
            <header className="users-edit-head">
              <strong>Edit user</strong>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                Close
              </button>
            </header>
            <div className="users-grid">
              <div className="field">
                <label>Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                >
                  <option value="member">Member</option>
                  <option value="action_officer">Action officer</option>
                  <option value="director">Director</option>
                  <option value="registrar">Registrar</option>
                </select>
              </div>
              <div className="field">
                <label>New password</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="Leave blank to keep current"
                  minLength={8}
                />
              </div>
            </div>
            <label className="users-active">
              <input
                type="checkbox"
                checked={editForm.active}
                onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
              />
              Active
            </label>
            <div className="users-edit-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void onDelete(editing)}>
                Delete user
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
