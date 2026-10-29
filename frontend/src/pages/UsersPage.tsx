import { useEffect, useState, type FormEvent } from 'react'
import { api, getAccessToken } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { IconButton, PenIcon, TrashIcon } from '../components/ActionIcons'
import { StatusToast } from '../components/Toast'
import './directory.css'

type Region = { id: number; name: string }
type Station = { id: number; name: string; office_id: number }
type Dept = { id: number; name: string; station_id?: number | null }

type U = {
  id: number
  name: string
  email: string
  phone?: string | null
  role: string
  active: boolean
  office_id?: number | null
  station_id?: number | null
  department_id?: number | null
  office?: Region | null
  station?: { name: string } | null
  department?: { name: string } | null
  has_signature?: boolean
}

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'staff',
  office_id: '' as number | '',
  station_id: '' as number | '',
  department_id: '' as number | '',
  password: '',
  active: true,
}

const roles = [
  { value: 'staff', label: 'Staff' },
  { value: 'hod', label: 'Head of Department' },
  { value: 'station_supervisor', label: 'Station supervisor' },
  { value: 'hos', label: 'Head of Station' },
  { value: 'senior_manager', label: 'Senior manager' },
  { value: 'registrar', label: 'Registry' },
  { value: 'admin', label: 'Admin' },
]

const needsStation = (role: string) =>
  role === 'staff' || role === 'hod' || role === 'hos' || role === 'station_supervisor'
const needsDepartment = (role: string) => role === 'staff' || role === 'hod'

export function UsersPage() {
  const { user: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const [users, setUsers] = useState<U[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [departments, setDepartments] = useState<Dept[]>([])
  const [error, setError] = useState('')
  const [tempPw, setTempPw] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<U | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [signatureNote, setSignatureNote] = useState('')

  async function load() {
    const [userRes, officeRes, stationRes, deptRes] = await Promise.all([
      api<{ users: U[] }>('/registry/users'),
      api<{ offices: Region[] }>('/offices'),
      api<{ stations: Station[] }>('/stations'),
      api<{ departments: Dept[] }>('/departments'),
    ])
    setUsers((userRes.users || []).filter((u) => u.active !== false || !u.name.includes('(deleted)')))
    setRegions(officeRes.offices || [])
    setStations(stationRes.stations || [])
    setDepartments(deptRes.departments || [])
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])

  function openCreate() {
    setCreating(true)
    setEditing(null)
    setForm(emptyForm)
    setSignatureFile(null)
    setSignatureNote('')
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
      station_id: u.station_id ?? '',
      department_id: u.department_id ?? '',
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
      role: form.role,
      office_id: form.office_id,
      station_id: needsStation(form.role) ? form.station_id || null : null,
      department_id: needsDepartment(form.role) ? form.department_id || null : null,
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
    if (!form.office_id) return
    setError('')
    setTempPw('')
    setSaving(true)
    try {
      const body = payload()
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
    if (!editing || !form.office_id) return
    setSaving(true)
    setError('')
    try {
      const body = payload()
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
  const regionStations = stations.filter((s) => s.office_id === form.office_id)
  const stationDepartments = departments.filter((d) => d.station_id === form.station_id)

  return (
    <div className="directory-page">
      <header className="directory-header">
        <div>
          <h1>Staff</h1>
          <p className="muted">Region, station, department, and role decide where shared mail goes.</p>
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
              <th>Station</th>
              <th>Department</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td className="directory-empty" colSpan={7}>
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
                <td>{u.station?.name || '—'}</td>
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
              <div className="field">
                <label>Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value, station_id: '', department_id: '' })}
                >
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Region</label>
                <select
                  value={form.office_id}
                  onChange={(e) =>
                    setForm({ ...form, office_id: Number(e.target.value), station_id: '', department_id: '' })
                  }
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
              {needsStation(form.role) && (
                <div className="field">
                  <label>Station</label>
                  <select
                    value={form.station_id}
                    onChange={(e) => setForm({ ...form, station_id: Number(e.target.value), department_id: '' })}
                    required
                  >
                    <option value="" disabled>
                      Select station
                    </option>
                    {regionStations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {needsDepartment(form.role) && (
                <div className="field">
                  <label>Department</label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm({ ...form, department_id: Number(e.target.value) })}
                    required
                  >
                    <option value="" disabled>
                      Select department
                    </option>
                    {stationDepartments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
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
              <button className="btn btn-primary" type="submit" disabled={saving || regions.length === 0}>
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
