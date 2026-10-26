import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from '../theme'
import './AppShell.css'

type NotifItem = {
  id: number
  document_id: number | null
  title?: string
  body?: string
  read_at?: string | null
}

function BellIcon() {
  return (
    <svg className="bell-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm8-3H4v-1.5l1.5-1.5V11a6.5 6.5 0 0 1 5-6.32V4a1.5 1.5 0 0 1 3 0v.68A6.5 6.5 0 0 1 18.5 11v4.5L20 17.5V19Z"
      />
    </svg>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isRegistrar = user?.role === 'registrar' || user?.role === 'admin'
  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [items, setItems] = useState<NotifItem[]>([])

  const preview = useMemo(() => items.slice(0, 4), [items])
  const hasMore = items.length > 4 || unread > preview.length

  const loadNotifs = useCallback(async () => {
    try {
      const res = await api<{ unread_count: number; items: NotifItem[] }>('/notifications/summary')
      setUnread(res.unread_count)
      setItems(res.items || [])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void loadNotifs()
    const t = window.setInterval(() => void loadNotifs(), 45000)
    const onFocus = () => void loadNotifs()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadNotifs])

  useEffect(() => {
    setMenuOpen(false)
    setNotifOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  useEffect(() => {
    if (!notifOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [notifOpen])

  async function openBell() {
    setMenuOpen(false)
    const next = !notifOpen
    setNotifOpen(next)
    if (next) {
      await loadNotifs()
    }
  }

  async function openItem(n: NotifItem) {
    setNotifOpen(false)
    if (!n.read_at) {
      try {
        const res = await api<{ unread_count: number }>('/notifications/mark-read', {
          method: 'POST',
          body: JSON.stringify({ ids: [n.id] }),
        })
        setUnread(res.unread_count)
      } catch {
        /* ignore */
      }
    }
    if (n.document_id) navigate(`/documents/${n.document_id}`)
    else navigate('/notifications')
  }

  const navLinks = isRegistrar ? (
    <>
      <NavLink to="/" end>
        All documents
      </NavLink>
      <NavLink to="/queue">Registry queue</NavLink>
      <NavLink to="/register">Register</NavLink>
      <NavLink to="/email-drafts">Email drafts</NavLink>
      <NavLink to="/branches">Branches</NavLink>
      <NavLink to="/departments">Departments</NavLink>
      <NavLink to="/users">Users</NavLink>
      <NavLink to="/search">Search</NavLink>
      <NavLink to="/notifications">Notifications</NavLink>
      <NavLink to="/signature">Signature</NavLink>
      <NavLink to="/settings">Settings</NavLink>
    </>
  ) : (
    <>
      <NavLink to="/" end>
        My inbox
      </NavLink>
      <NavLink to="/submit">Submit document</NavLink>
      <NavLink to="/search">Search</NavLink>
      <NavLink to="/notifications">Notifications</NavLink>
      <NavLink to="/signature">Signature</NavLink>
      <NavLink to="/settings">Settings</NavLink>
    </>
  )

  return (
    <div className={`shell${menuOpen ? ' menu-open' : ''}`}>
      <header className="shell-topbar">
        <button
          type="button"
          className="hamburger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="shell-drawer"
          onClick={() => {
            setNotifOpen(false)
            setMenuOpen((v) => !v)
          }}
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
        <div className="shell-brand shell-brand-compact">
          <span className="shell-mark" aria-hidden />
          <div className="shell-title">EDMS</div>
        </div>
        <span className="shell-topbar-spacer" aria-hidden />
      </header>

      {menuOpen && (
        <button
          type="button"
          className="shell-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside id="shell-drawer" className="shell-rail">
        <div className="shell-brand shell-brand-desktop">
          <span className="shell-mark" aria-hidden />
          <div>
            <div className="shell-title">EDMS</div>
            <div className="shell-sub">Document registry</div>
          </div>
        </div>
        <div className="shell-drawer-label">Menu</div>
        <nav className="shell-nav">{navLinks}</nav>
        <div className="shell-user">
          <div className="shell-user-row">
            <div>
              <strong>{user?.name}</strong>
              <div className="muted">{user?.role?.replaceAll('_', ' ')}</div>
            </div>
          </div>
          <ThemeToggle />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setMenuOpen(false)
              void logout()
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="shell-main">
        <Outlet />
      </main>

      <div className="notif-fab-wrap">
        {notifOpen && (
          <div className="notif-popup" role="dialog" aria-label="Recent notifications">
            <div className="notif-head">
              <strong>Notifications</strong>
              <button type="button" className="notif-close" onClick={() => setNotifOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="notif-popup-list">
              {preview.length === 0 && (
                <p className="muted notif-empty">No new notifications</p>
              )}
              {preview.map((n) => (
                <button key={n.id} type="button" className="notif-item" onClick={() => void openItem(n)}>
                  <strong>{n.title || 'Update'}</strong>
                  <span className="muted">{n.body}</span>
                </button>
              ))}
            </div>
            <Link
              to="/notifications"
              className="notif-footer"
              onClick={() => setNotifOpen(false)}
            >
              {hasMore || items.length > 0 ? 'View all notifications' : 'Open notifications'}
            </Link>
          </div>
        )}
        <button
          type="button"
          className="notif-fab"
          onClick={() => void openBell()}
          aria-label="Notifications"
          aria-expanded={notifOpen}
        >
          <BellIcon />
          {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>
    </div>
  )
}
