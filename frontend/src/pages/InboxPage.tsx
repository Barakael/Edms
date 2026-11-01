import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { MailTable, type MailDoc } from '../components/MailTable'
import { StatusToast } from '../components/Toast'
import './InboxPage.css'

export function InboxPage({ box = 'inbox' }: { box?: 'inbox' | 'preview' | 'archive' }) {
  const { user } = useAuth()
  const [docs, setDocs] = useState<MailDoc[]>([])
  const [error, setError] = useState('')
  const showDepartment =
    user?.role === 'registrar' || user?.role === 'admin' || user?.role === 'senior_manager'

  const title = box === 'preview' ? 'Preview Box' : box === 'archive' ? 'Archives' : 'Inbox'
  const blurb =
    box === 'preview'
      ? 'New mail with no designated desk. Registry and senior managers.'
      : box === 'archive'
        ? 'Scanned mail stored for archival only. It does not need processing.'
        : 'Mail that is with you for processing.'
  const empty =
    box === 'preview' ? 'Preview Box is empty.' : box === 'archive' ? 'Archives is empty.' : 'No mail in your inbox.'

  useEffect(() => {
    api<{ data: MailDoc[] }>(`/documents/inbox?box=${box}`)
      .then((res) => setDocs(res.data || []))
      .catch((e) => setError(e.message))
  }, [box])

  return (
    <div className="inbox-page">
      <StatusToast error={error} />
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-brand-dark)' }}>{title}</h1>
        <p className="muted">{blurb}</p>
      </header>
      {error && <p className="error-text">{error}</p>}
      <MailTable docs={docs} empty={empty} showDepartment={showDepartment} />
    </div>
  )
}
