import { useEffect, useState, type FormEvent } from 'react'
import { api, getAccessToken } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { IconButton, PenIcon, TrashIcon } from '../components/ActionIcons'
import { StatusToast } from '../components/Toast'
import './directory.css'

type Region = { id: number; name: string }
type Dept = { id: number; name: string; office_id?: number }

type U = {
  id: number
  name: string
  email: string
  phone?: string | null
  role: string
  active: boolean
  office_id?: number | null
  department_id?: number | null
  office?: Region | null
  department?: { id?: number; name: string } | null
  has_signature?: boolean
}

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'staff',
  office_id: '' as number | '',
  department_id: '' as number | '',
  password: '',
  active: true,
}

const allRoles = [
  { value: 'staff', label: 'Staff' },
  { value: 'hod', label: 'Head of Department' },
  { value: 'senior_manager', label: 'Senior manager' },
  { value: 'registrar', label: 'Registry' },
  { value: 'admin', label: 'Admin' },
]

const needsDepartment = (role: string) => role === 'staff' || role === 'hod'

export function UsersPage() {
  const { user: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const isHod = me?.role === 'hod'
  const isElevated = me?.role === 'registrar' || me?.role === 'admin'
  const [users, setUsers] = useState<U[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [departments, setDepartments] = useState<Dept[]>([])
  const [error, setError] = useState('')
  const [tempPw, setTempPw] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<U | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [signatureNote, setSignatureNote] = useState('')

  const roles = isHod ? allRoles.filter((r) => r.value === 'staff') : allRoles

  async function load() {
    const [userRes, officeRes, deptRes] = await Promise.all([
      api<{ users: U[] }>('/registry/users'),
      api<{ offices: Region[] }>('/offices'),
      api<{ departments: Dept[] }>('/departments'),
    ])
    setUsers((userRes.users || []).filter((u) => u.active !== false || !u.name.includes('(deleted)')))
    setRegions(officeRes.offices || [])
    setDepartments(
      (deptRes.departments || []).map((d) => ({
        ...d,
        id: Number(d.id),
        office_id: d.office_id == null ? undefined : Number(d.office_id),
      })),
    )
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])

  function openCreate() {
    setCreating(true)
    setEditing(null)
    setForm({
      ...emptyForm,
      role: 'staff',
      office_id: isHod && me?.office_id ? me.office_id : '',
      department_id: isHod && me?.department_id ? me.department_id : '',
    })
    setSignatureFile(null)
    setSignatureNote('')
    setError('')
  }

  function openEdit(u: U) {
    setEditing(u)
    setCreating(false)
    const officeId = u.office_id ?? u.office?.id
    const departmentId = u.department_id ?? u.department?.id
    setForm({
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      office_id: officeId != null && officeId !== '' ? Number(officeId) : '',
      department_id: departmentId != null && departmentId !== '' ? Number(departmentId) : '',
      password: '',
      active: u.active,
    })
    setSignatureFile(null)
    setSignatureNote(u.has_signature ? 'A signature is already registered.' : 'No signature yet.')
    setError('')
  }

  function closeModal() {
    setCreating(false)
    setEditing(null)
  }

  function payload() {
    const body: Record<string, string | number | boolean | null> = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      role: isHod ? 'staff' : form.role,
      office_id: form.office_id,
      department_id: needsDepartment(isHod ? 'staff' : form.role) ? form.department_id || null : null,
    }
    if (isHod && me?.department_id) {
      body.department_id = me.department_id
      // office_id still required by API — use form or first region as fallback filled on create
    }
    return body
  }

  async function uploadSignature(userId: number) {
    if (!isAdmin || !signatureFile) return
    const fd = new FormData()
    fd.append('file', signatureFile)
    const res = await fetch(`/api/registry/users/${userId}/signature`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Signature upload failed')
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!isHod && !form.office_id) return
    setError('')
    setTempPw('')
    setSaving(true)
    try {
      const body = payload()
      if (isHod) {
        // API overwrites office/department from HoD; send placeholders if missing
        if (!body.office_id) {
          const dept = departments.find((d) => d.id === me?.department_id)
          body.office_id = dept?.office_id || regions[0]?.id || ''
        }
      }
      if (form.password) body.password = form.password
      const res = await api<{ temporary_password: string; user: U }>('/registry/users', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (res.user?.id) await uploadSignature(res.user.id)
      setTempPw(res.temporary_password)
      setForm(emptyForm)
      setSignatureFile(null)
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
    if (!editing || (!isHod && !form.office_id)) return
    setSaving(true)
    setError('')
    try {
      const body = payload()
      if (isHod && !body.office_id) {
        body.office_id = editing.office_id || regions[0]?.id || ''
      }
      body.active = form.active
      if (form.password.trim()) body.password = form.password.trim()
      await api(`/registry/users/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      await uploadSignature(editing.id)
      setEditing(null)
      setSignatureFile(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(u: U) {
    if (!confirm(`Delete staff member ${u.name}? They will be deactivated and cannot sign in.`)) return
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
  const regionDepartments = departments.filter(
    (d) => form.office_id !== '' && Number(d.office_id) === Number(form.office_id),
  )

  if (!isElevated && !isHod) {
    return <p className="error-text">You do not have access to staff administration.</p>
  }

  return (
    <div className="directory-page">
      <header className="directory-header">
        <div>
          <h1>{isHod ? 'Department staff' : 'Staff'}</h1>
          <p className="muted">
            {isHod
              ? 'Add or remove staff in your department.'
              : 'Region, department, and role decide where shared mail goes.'}
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          Add staff
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
              <th>Role</th>
              <th>Region</th>
              <th>Department</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td className="directory-empty" colSpan={6}>
                  No staff yet.
                </td>
              </tr>
            )}
            {visible.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role.replaceAll('_', ' ')}</td>
                <td>{u.office?.name || '—'}</td>
                <td>{u.department?.name || '—'}</td>
                <td className="directory-actions">
                  <IconButton aria-label={`Edit ${u.name}`} title="Edit" onClick={() => openEdit(u)}>
                    <PenIcon />
                  </IconButton>
                  <IconButton
                    tone="danger"
                    aria-label={`Delete ${u.name}`}
                    title="Delete"
                    onClick={() => void onDelete(u)}
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
              <strong>{editing ? 'Edit staff' : 'Add staff'}</strong>
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
              {!isHod && (
                <div className="field">
                  <label>Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value, department_id: '' })}
                  >
                    {roles.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!isHod && (
                <div className="field">
                  <label>Region</label>
                  <select
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
              )}
              {!isHod && needsDepartment(form.role) && (
                <div className="field">
                  <label>Department</label>
                  <select
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
              )}
              {isHod && (
                <div className="field">
                  <label>Department</label>
                  <input value={me?.department_name || 'Your department'} readOnly />
                </div>
              )}
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
              {isAdmin && (
                <div className="field">
                  <label htmlFor="signature-file">Signature image</label>
                  <input
                    id="signature-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setSignatureFile(e.target.files?.[0] || null)}
                  />
                  {signatureNote && <p className="muted">{signatureNote}</p>}
                </div>
              )}
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
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || (!isHod && regions.length === 0)}
              >
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add staff'}
              </button>
              {editing && (
                <button type="button" className="btn btn-danger" onClick={() => void onDelete(editing)}>
                  Delete staff
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
