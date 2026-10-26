import { useEffect, useState } from 'react'
import { api } from '../api/client'

type Row = {
  id: number
  status: string
  notes?: string
  user?: { id: number; name: string; email: string }
}

export function DownloadRequestsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')

  async function load() {
    const res = await api<{ data: Row[] }>('/download-requests')
    setRows(res.data || [])
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])

  async function review(id: number, status: 'approved' | 'denied') {
    await api(`/download-requests/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    })
    await load()
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>
        Download requests
      </h1>
      {error && <p className="error-text">{error}</p>}
      <div className="panel" style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Notes</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.user?.name}
                  <div className="muted">{r.user?.email}</div>
                </td>
                <td>{r.notes || '—'}</td>
                <td>
                  <span className="badge">{r.status}</span>
                </td>
                <td>
                  {r.status === 'pending' && (
                    <>
                      <button type="button" className="btn btn-primary" onClick={() => void review(r.id, 'approved')}>
                        Approve
                      </button>{' '}
                      <button type="button" className="btn btn-secondary" onClick={() => void review(r.id, 'denied')}>
                        Deny
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="muted">
                  No requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
