import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { StatusToast } from '../components/Toast'
import './directory.css'

type Branch = { id: number; name: string }
type Dept = {
  id: number
  name: string
  active: boolean
  office_id: number
  office?: Branch
}

const emptyForm = { name: '', office_id: '' as number | '' }

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Dept[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<Dept | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const [deptRes, officeRes] = await Promise.all([
      api<{ departments: Dept[] }>('/departments'),
      api<{ offices: Branch[] }>('/offices'),
    ])
    setDepartments(deptRes.departments || [])
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

  function openEdit(dept: Dept) {
    setEditing(dept)
    setCreating(false)
    setForm({ name: dept.name, office_id: dept.office_id })
    setError('')
  }

  function closeModal() {
    setCreating(false)
    setEditing(null)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.office_id) return
    setSaving(true)
    setError('')
    try {
      await api('/departments', {
        method: 'POST',
        body: JSON.stringify({ office_id: form.office_id, name: form.name }),
      })
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
      await api(`/departments/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: form.name, office_id: form.office_id }),
      })
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(dept: Dept) {
    if (!confirm(`Delete department ${dept.name}? It will be removed from new registrations.`)) return
    setError('')
    try {
      await api(`/departments/${dept.id}`, { method: 'DELETE' })
      if (editing?.id === dept.id) setEditing(null)
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
          <h1>Departments</h1>
          <p className="muted">Managed list per branch — used when registering documents.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          Add department
        </button>
      </header>
      <StatusToast error={error} />
      {error && !modalOpen && <p className="error-text">{error}</p>}

      <div className="panel directory-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Branch</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.length === 0 && (
              <tr>
                <td className="directory-empty" colSpan={3}>
                  No departments yet.
                </td>
              </tr>
            )}
            {departments.map((dept) => (
              <tr key={dept.id}>
                <td>{dept.name}</td>
                <td>{dept.office?.name || '—'}</td>
                <td className="directory-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => openEdit(dept)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void onDelete(dept)}>
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
              <strong>{editing ? 'Edit department' : 'Add department'}</strong>
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
                <label htmlFor="dept-name">Department name</label>
                <input
                  id="dept-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="dept-branch">Branch</label>
                <select
                  id="dept-branch"
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
            </div>
            <div className="directory-modal-actions">
              <button className="btn btn-primary" type="submit" disabled={saving || branches.length === 0}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add department'}
              </button>
              {editing && (
                <button type="button" className="btn btn-danger" onClick={() => void onDelete(editing)}>
                  Delete department
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
