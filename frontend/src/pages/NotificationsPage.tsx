import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import './NotificationsPage.css'

type NotifItem = {
  id: number
  document_id: number | null
  title?: string
  body?: string
  read_at?: string | null
  created_at?: string
}

export function NotificationsPage() {
  const [items, setItems] = useState<NotifItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api<{ items: NotifItem[] }>('/notifications/summary')
      .then(async (res) => {
        setItems(res.items || [])
        const unreadIds = (res.items || []).filter((n) => !n.read_at).map((n) => n.id)
        if (unreadIds.length) {
          await api('/notifications/mark-read', {
            method: 'POST',
            body: JSON.stringify({ ids: unreadIds }),
          }).catch(() => undefined)
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="notifications-page">
      <header className="notifications-header">
        <h1>Notifications</h1>
        <p className="muted">All assignment and document alerts.</p>
      </header>
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && (
        <div className="panel notifications-list">
          {items.length === 0 && <p className="muted notifications-empty">No notifications yet.</p>}
          {items.map((n) => (
            <div key={n.id} className={`notifications-row${n.read_at ? '' : ' is-unread'}`}>
              <div>
                <strong>{n.title || 'Update'}</strong>
                <p className="muted">{n.body}</p>
                {n.created_at && (
                  <time className="muted">{new Date(n.created_at).toLocaleString()}</time>
                )}
              </div>
              {n.document_id ? (
                <Link className="btn btn-secondary" to={`/documents/${n.document_id}`}>
                  Open
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
