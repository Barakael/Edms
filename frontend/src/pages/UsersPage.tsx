import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { StatusToast } from '../components/Toast'
import './directory.css'

type Branch = { id: number; name: string }

type U = {
  id: number
  name: string
  email: string
  phone?: string | null
  role: string
  active: boolean
  office_id?: number | null
  office?: Branch | null
}

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'action_officer',
  office_id: '' as number | '',
  password: '',
  active: true,
}

const roles = [
  { value: 'member', label: 'Member' },
  { value: 'action_officer', label: 'Action officer' },
  { value: 'director', label: 'Director' },
  { value: 'registrar', label: 'Registrar' },
]

export function UsersPage() {
  const [users, setUsers] = useState<U[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [error, setError] = useState('')
  const [tempPw, setTempPw] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<U | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [userRes, officeRes] = await Promise.all([
      api<{ users: U[] }>('/registry/users'),
      api<{ offices: Branch[] }>('/offices'),
    ])
    setUsers((userRes.users || []).filter((u) => u.active !== false || !u.name.includes('(deleted)')))
    setBranches(officeRes.offices || [])
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])

  function openCreate() {
    setCreating(true)
    setEditing(null)
    setForm(emptyForm)
    setError('')
  }

  function openEdit(u: U) {
    setEditing(u)
    setCreating(false)
    setForm({
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      office_id: u.office_id ?? u.office?.id ?? '',
      password: '',
      active: u.active,
    })
    setError('')
  }

  function closeModal() {
    setCreating(false)
    setEditing(null)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.office_id) return
    setError('')
    setTempPw('')
    setSaving(true)
    try {
      const payload: Record<string, string | number> = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        office_id: form.office_id,
      }
      if (form.password) payload.password = form.password
      const res = await api<{ temporary_password: string }>('/registry/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setTempPw(res.temporary_password)
      setForm(emptyForm)
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
    if (!editing || !form.office_id) return
    setSaving(true)
    setError('')
    try {
      const body: Record<string, string | number | boolean> = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        office_id: form.office_id,
        active: form.active,
      }
      if (form.password.trim()) body.password = form.password.trim()
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
  const modalOpen = creating || editing !== null

  return (
    <div className="directory-page">
      <header className="directory-header">
        <div>
          <h1>Users</h1>
          <p className="muted">Registry creates and manages accounts. Each person is tied to a branch.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          Add new user
        </button>
      </header>
      <StatusToast error={error} />
      {error && !modalOpen && <p className="error-text">{error}</p>}
      {tempPw && <p className="directory-temp-pw">Temporary password: {tempPw}</p>}

      <div className="panel directory-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td className="directory-empty" colSpan={6}>
                  No users yet.
                </td>
              </tr>
            )}
            {visible.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td>{u.role.replaceAll('_', ' ')}</td>
                <td>{u.office?.name || '—'}</td>
                <td className="directory-actions">
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

      {modalOpen && (
        <div className="directory-backdrop" role="dialog" aria-modal="true">
          <form className="panel directory-modal" onSubmit={editing ? onSaveEdit : onCreate}>
            <header className="directory-modal-head">
              <strong>{editing ? 'Edit user' : 'Add new user'}</strong>
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Close
              </button>
            </header>
            {error && modalOpen && (
              <p className="error-text" style={{ margin: '1rem 1rem 0' }}>
                {error}
              </p>
            )}
            <div className="directory-grid">
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
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                  {form.role === 'admin' && <option value="admin">Admin</option>}
                </select>
              </div>
              <div className="field">
                <label>Branch</label>
                <select
                  value={form.office_id}
                  onChange={(e) => setForm({ ...form, office_id: Number(e.target.value) })}
                  required
                >
                  <option value="" disabled>
                    Select branch
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{editing ? 'New password' : 'Password (optional)'}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editing ? 'Leave blank to keep current' : 'Auto-generated if empty'}
                  minLength={form.password ? 8 : undefined}
                />
              </div>
            </div>
            {editing && (
              <label className="directory-active">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active
              </label>
            )}
            <div className="directory-modal-actions">
              <button className="btn btn-primary" type="submit" disabled={saving || branches.length === 0}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
              </button>
              {editing && (
                <button type="button" className="btn btn-danger" onClick={() => void onDelete(editing)}>
                  Delete user
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
