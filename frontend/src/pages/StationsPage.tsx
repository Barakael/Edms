import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { StatusToast } from '../components/Toast'
import './directory.css'

type Region = { id: number; name: string }
type Station = { id: number; name: string; office_id: number; office?: Region }

const empty = { name: '', office_id: '' as number | '' }

export function StationsPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<Station | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const [stationRes, officeRes] = await Promise.all([
      api<{ stations: Station[] }>('/stations'),
      api<{ offices: Region[] }>('/offices'),
    ])
    setStations(stationRes.stations || [])
    setRegions(officeRes.offices || [])
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])

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
      await api('/stations', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, office_id: form.office_id }),
      })
      setForm(empty)
      setCreating(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!editing || !form.office_id) return
    setSaving(true)
    setError('')
    try {
      await api(`/stations/${editing.id}`, {
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

  async function onDelete(station: Station) {
    if (!confirm(`Delete station ${station.name}?`)) return
    try {
      await api(`/stations/${station.id}`, { method: 'DELETE' })
      if (editing?.id === station.id) setEditing(null)
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
          <h1>Stations</h1>
          <p className="muted">Main operational offices inside a region. Each station has a Head of Station.</p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            setCreating(true)
            setEditing(null)
            setForm(empty)
            setError('')
          }}
        >
          Add station
        </button>
      </header>
      <StatusToast error={error} />
      {error && !modalOpen && <p className="error-text">{error}</p>}
      <div className="panel directory-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Station</th>
              <th>Region</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stations.length === 0 && (
              <tr>
                <td className="directory-empty" colSpan={3}>
                  No stations yet.
                </td>
              </tr>
            )}
            {stations.map((station) => (
              <tr key={station.id}>
                <td>{station.name}</td>
                <td>{station.office?.name || '—'}</td>
                <td className="directory-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditing(station)
                      setCreating(false)
                      setForm({ name: station.name, office_id: station.office_id })
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void onDelete(station)}>
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
          <form className="panel directory-modal" onSubmit={editing ? onSave : onCreate}>
            <header className="directory-modal-head">
              <strong>{editing ? 'Edit station' : 'Add station'}</strong>
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
                <label htmlFor="station-name">Station name</label>
                <input
                  id="station-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="station-region">Region</label>
                <select
                  id="station-region"
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
            </div>
            <div className="directory-modal-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add station'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
