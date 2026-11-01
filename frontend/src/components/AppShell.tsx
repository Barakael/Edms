import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from '../theme'
import logo from '../assets/tazama-pipelines.png'
import './AppShell.css'

const CRUMBS: Record<string, string> = {
  '/': 'Inbox',
  '/queue': 'Mail preview',
  '/archive': 'Archives',
  '/files': 'Files',
  '/register': 'Incoming Documents',
  '/email-drafts': 'Drafts',
  '/bulk-uploads': 'Bulk Uploads',
  '/search': 'Trace mail movement',
  '/submit': 'Submit document',
  '/regions': 'Regions',
  '/departments': 'Departments',
  '/staff': 'Staff',
  '/users': 'Staff',
  '/roles': 'Roles',
  '/notifications': 'Notifications',
  '/settings': 'Settings',
  '/signature': 'Signature',
  '/download-requests': 'Download requests',
  '/download-access': 'Download access',
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'System admin',
  registrar: 'Registry',
  senior_manager: 'Senior manager',
  hod: 'Head of department',
  staff: 'Staff',
}

function crumbFor(pathname: string) {
  if (pathname.startsWith('/documents/')) return 'Document'
  if (pathname.startsWith('/files/')) return 'File'
  return CRUMBS[pathname] || 'Home'
}

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

  const isRegistry = user?.role === 'registrar' || user?.role === 'admin'
  const seesPreview = isRegistry || user?.role === 'senior_manager'
  const crumb = crumbFor(location.pathname)
  const roleLabel = ROLE_LABEL[user?.role || ''] || (user?.role || '').replaceAll('_', ' ')
  const createTo = isRegistry ? '/register' : '/submit'

  const navLinks = (
    <>
      <div className="shell-nav-label">Mail movement</div>
      {isRegistry && <NavLink to="/email-drafts">1.0 Drafts</NavLink>}
      {isRegistry && <NavLink to="/bulk-uploads">2.0 Bulk Uploads</NavLink>}
      {seesPreview && <NavLink to="/queue">3.0 Preview Box</NavLink>}
      <NavLink to="/" end>
        4.0 Inbox
      </NavLink>
      <NavLink to="/archive">5.0 Archives</NavLink>
      <NavLink to="/files">6.0 Files</NavLink>
      <NavLink to="/search">7.0 Trace mail movement</NavLink>
      {!isRegistry && (
        <NavLink to="/submit">
          {user?.role === 'staff' ? '8.0 Internal memo' : '8.0 Submit document'}
        </NavLink>
      )}
      {(isRegistry || user?.role === 'hod') && (
        <>
          <div className="shell-nav-box">8.0 Administration</div>
          {isRegistry && <NavLink to="/regions">Regions</NavLink>}
          {isRegistry && <NavLink to="/departments">Departments</NavLink>}
          <NavLink to="/staff">Staff</NavLink>
          {isRegistry && <NavLink to="/roles">Roles</NavLink>}
        </>
      )}
      <NavLink to="/notifications">9.0 Notifications</NavLink>
    </>
  )

  return (
    <div className={`shell${menuOpen ? ' menu-open' : ''}`}>
      <div className="shell-chrome">
        <header className="shell-identity">
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
          <Link to="/" className="shell-brand" onClick={() => setMenuOpen(false)}>
            <img src={logo} alt="TAZAMA Pipelines" />
            <span className="shell-brand-text">
              <span className="shell-brand-name">rDMS-HQ</span>
              <span className="shell-brand-sep" aria-hidden>
                |
              </span>
              <span className="shell-brand-full">Records & Document Management System</span>
            </span>
          </Link>
          <div className="shell-identity-actions">
            <span className="shell-role">{roleLabel}</span>
            <span className="shell-identity-links">
              <ThemeToggle variant="icon" />
              <Link to="/settings">Settings</Link>
              <button
                type="button"
                className="shell-text-btn"
                onClick={() => {
                  setMenuOpen(false)
                  void logout()
                }}
              >
                Log out
              </button>
            </span>
            <Link to={createTo} className="shell-create" onClick={() => setMenuOpen(false)}>
              Create Memo
            </Link>
          </div>
        </header>
        <div className="shell-crumb">
          <Link to="/">Home</Link>
          {crumb !== 'Home' && (
            <>
              <span aria-hidden> › </span>
              <span>{crumb}</span>
            </>
          )}
        </div>
      </div>

      {menuOpen && (
        <button
          type="button"
          className="shell-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="shell-body">
        <aside id="shell-drawer" className="shell-queries">
          <div className="shell-queries-title">User queries</div>
          <nav className="shell-nav">{navLinks}</nav>
          <div className="shell-drawer-utils">
            <div className="shell-drawer-user">
              <strong>{user?.name}</strong>
              <span>{roleLabel}</span>
            </div>
            <ThemeToggle variant="icon" />
            <Link to="/settings" onClick={() => setMenuOpen(false)}>
              Settings
            </Link>
            <button
              type="button"
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
      </div>

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
