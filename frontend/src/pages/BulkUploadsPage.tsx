import { useCallback, useEffect, useRef, useState } from 'react'
import { api, fetchAuthorizedBlob, getAccessToken } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  acceptAttribute,
  ensureDirectoryPermission,
  fileWatchKey,
  getRememberedFolderName,
  listAcceptedFiles,
  loadDirectoryHandle,
  pickWatchDirectory,
  supportsDirectoryPicker,
} from '../lib/folderWatch'
import './BulkUploadsPage.css'
import './InboxPage.css'

type BulkFile = {
  id: number
  mime?: string
  original_filename?: string
}

type BulkDoc = {
  id: number
  box?: string
  status?: string
  updated_at?: string
  created_at?: string
  registration?: { mail_subject?: string | null; mail_type?: string | null }
  files?: BulkFile[]
}

type BulkAction = 'inbox' | 'preview' | 'archive' | 'delete'

const POLL_MS = 4000

function BulkTilePreview({ file }: { file?: BulkFile }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!file?.id) return
    let revoked: string | null = null
    let cancelled = false
    setUrl(null)
    setErr('')
    void fetchAuthorizedBlob(`/files/${file.id}/stream`)
      .then((blob) => {
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        revoked = objectUrl
        setUrl(objectUrl)
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Preview failed')
      })
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [file?.id])

  if (!file) return <p className="muted">No file</p>
  if (err) return <p className="muted">{err}</p>
  if (!url) return <p className="muted">Loading…</p>

  const mime = file.mime || ''
  if (mime.startsWith('image/')) {
    return <img src={url} alt={file.original_filename || 'Scan'} />
  }
  return <iframe title={file.original_filename || 'Scan'} src={url} />
}

export function BulkUploadsPage() {
  const { user } = useAuth()
  const isRegistry = user?.role === 'registrar' || user?.role === 'admin'
  const [docs, setDocs] = useState<BulkDoc[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [folderName, setFolderName] = useState<string | null>(getRememberedFolderName())
  const [watching, setWatching] = useState(false)
  const dirRef = useRef<FileSystemDirectoryHandle | null>(null)
  const uploadedKeys = useRef<Set<string>>(new Set())
  const scanning = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canWatch = supportsDirectoryPicker()

  const loadDocs = useCallback(async () => {
    const res = await api<{ data: BulkDoc[] }>('/documents/inbox?box=bulk')
    setDocs(res.data || [])
  }, [])

  useEffect(() => {
    if (!isRegistry) return
    void loadDocs().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [isRegistry, loadDocs])

  const ingestFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return
      const fd = new FormData()
      for (const f of files) fd.append('files[]', f)
      setUploading(true)
      try {
        const res = await fetch('/api/documents/bulk-ingest', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${getAccessToken()}`,
          },
          body: fd,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Upload failed')
        const created = data.created ?? 0
        const skipped = data.skipped ?? 0
        if (created > 0) {
          setStatus(`Uploaded ${created} file${created === 1 ? '' : 's'}${skipped ? ` (${skipped} duplicate skipped)` : ''}.`)
          await loadDocs()
        } else if (skipped > 0) {
          setStatus(`No new files (${skipped} already uploaded).`)
        }
      } finally {
        setUploading(false)
      }
    },
    [loadDocs],
  )

  const scanFolder = useCallback(async () => {
    const handle = dirRef.current
    if (!handle || scanning.current) return
    scanning.current = true
    try {
      const ok = await ensureDirectoryPermission(handle, false)
      if (!ok) {
        setWatching(false)
        setStatus('Folder permission lost — reconnect the folder.')
        return
      }
      const listed = await listAcceptedFiles(handle)
      const fresh: File[] = []
      for (const item of listed) {
        if (uploadedKeys.current.has(item.key)) continue
        uploadedKeys.current.add(item.key)
        fresh.push(item.file)
      }
      if (fresh.length) await ingestFiles(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Folder scan failed')
      setWatching(false)
    } finally {
      scanning.current = false
    }
  }, [ingestFiles])

  const connectFolder = useCallback(async () => {
    setError('')
    try {
      const handle = await pickWatchDirectory()
      dirRef.current = handle
      setFolderName(handle.name)
      setWatching(true)
      setStatus(`Watching “${handle.name}” for new scans.`)
      await scanFolder()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Could not open folder')
    }
  }, [scanFolder])

  const reconnectFolder = useCallback(async () => {
    setError('')
    try {
      let handle = dirRef.current || (await loadDirectoryHandle())
      if (!handle) {
        await connectFolder()
        return
      }
      const granted = await ensureDirectoryPermission(handle, true)
      if (!granted) {
        await connectFolder()
        return
      }
      dirRef.current = handle
      setFolderName(handle.name)
      setWatching(true)
      setStatus(`Watching “${handle.name}” for new scans.`)
      await scanFolder()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Could not reconnect folder')
    }
  }, [connectFolder, scanFolder])

  useEffect(() => {
    if (!isRegistry || !canWatch) return
    let cancelled = false
    void (async () => {
      const handle = await loadDirectoryHandle()
      if (cancelled || !handle) return
      dirRef.current = handle
      setFolderName(handle.name)
      const ok = await ensureDirectoryPermission(handle, false)
      if (ok) {
        setWatching(true)
        setStatus(`Watching “${handle.name}” for new scans.`)
        await scanFolder()
      } else {
        setWatching(false)
        setStatus(`Saved folder “${handle.name}” — click Reconnect to resume watching.`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isRegistry, canWatch, scanFolder])

  useEffect(() => {
    if (!watching || !dirRef.current) return
    const id = window.setInterval(() => {
      void scanFolder()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [watching, scanFolder])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === docs.length) setSelected(new Set())
    else setSelected(new Set(docs.map((d) => d.id)))
  }

  async function runAction(action: BulkAction) {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (action === 'delete' && !window.confirm(`Delete ${ids.length} document${ids.length === 1 ? '' : 's'}?`)) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await api('/documents/bulk-action', {
        method: 'POST',
        body: JSON.stringify({ ids, action }),
      })
      setSelected(new Set())
      const labels: Record<BulkAction, string> = {
        inbox: 'moved to Inbox',
        preview: 'moved to Preview Box',
        archive: 'archived',
        delete: 'deleted',
      }
      setStatus(`${ids.length} document${ids.length === 1 ? '' : 's'} ${labels[action]}.`)
      await loadDocs()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  function onManualFiles(list: FileList | null) {
    if (!list?.length) return
    const files = Array.from(list)
    for (const f of files) uploadedKeys.current.add(fileWatchKey(f))
    void ingestFiles(files).catch((e) => setError(e instanceof Error ? e.message : 'Upload failed'))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (!isRegistry) {
    return (
      <div className="bulk-page inbox-page">
        <p className="error-text">Bulk Uploads is available to registry only.</p>
      </div>
    )
  }

  const hasSelection = selected.size > 0

  return (
    <div className="bulk-page inbox-page">
      <header style={{ marginBottom: '1.25rem' }}>
        <h1>Bulk Uploads</h1>
        <p className="muted">
          Watch a local folder for new scans, preview them here, then send selected items to Inbox, Preview Box,
          Archive, or Delete.
        </p>
      </header>

      {error && <p className="error-text">{error}</p>}
      {status && !error && <p className="muted" style={{ marginBottom: '0.75rem' }}>{status}</p>}

      <div className="panel bulk-folder-bar">
        <div className="bulk-folder-meta">
          <strong>
            <span className={`bulk-status-dot${watching ? ' on' : ''}`} />
            {folderName ? `Folder: ${folderName}` : 'No folder selected'}
          </strong>
          <p className="muted">
            {canWatch
              ? watching
                ? uploading
                  ? 'Uploading new files…'
                  : 'Watching while this page is open'
                : 'Choose or reconnect a folder to auto-upload new scans'
              : 'Folder watch needs Chrome or Edge — use manual upload below'}
          </p>
        </div>
        <div className="bulk-folder-actions">
          {canWatch && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => void connectFolder()} disabled={uploading}>
                {folderName ? 'Change folder' : 'Choose watch folder'}
              </button>
              {folderName && (
                <button type="button" className="btn" onClick={() => void reconnectFolder()} disabled={uploading}>
                  Reconnect
                </button>
              )}
              {watching && (
                <button type="button" className="btn" onClick={() => void scanFolder()} disabled={uploading}>
                  Upload now
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Manual upload
          </button>
          <input
            ref={fileInputRef}
            className="bulk-hidden-input"
            type="file"
            accept={acceptAttribute()}
            multiple
            onChange={(e) => onManualFiles(e.target.files)}
          />
        </div>
      </div>

      <div className="bulk-toolbar">
        <label className="bulk-select-all">
          <input
            type="checkbox"
            checked={docs.length > 0 && selected.size === docs.length}
            onChange={toggleAll}
            disabled={!docs.length}
          />
          Select all
        </label>
        <span className="bulk-count">
          {selected.size} selected · {docs.length} in queue
        </span>
        <button type="button" className="btn btn-primary" disabled={!hasSelection || busy} onClick={() => void runAction('inbox')}>
          To Inbox
        </button>
        <button type="button" className="btn" disabled={!hasSelection || busy} onClick={() => void runAction('preview')}>
          To Preview Box
        </button>
        <button type="button" className="btn" disabled={!hasSelection || busy} onClick={() => void runAction('archive')}>
          Archive
        </button>
        <button type="button" className="btn" disabled={!hasSelection || busy} onClick={() => void runAction('delete')}>
          Delete
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="panel">
          <p className="bulk-empty">
            No bulk uploads yet. Choose a watch folder or upload scans manually — they will appear here for triage.
          </p>
        </div>
      ) : (
        <div className="bulk-grid">
          {docs.map((doc) => {
            const file = doc.files?.[0]
            const title = doc.registration?.mail_subject || file?.original_filename || `Document ${doc.id}`
            const when = doc.updated_at || doc.created_at
            const isSelected = selected.has(doc.id)
            return (
              <article key={doc.id} className={`bulk-tile${isSelected ? ' is-selected' : ''}`}>
                <input
                  className="bulk-tile-check"
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(doc.id)}
                  aria-label={`Select ${title}`}
                />
                <div className="bulk-tile-preview">
                  <BulkTilePreview file={file} />
                </div>
                <div className="bulk-tile-meta">
                  <span className="bulk-tile-title" title={title}>
                    {title}
                  </span>
                  <p className="muted">{when ? new Date(when).toLocaleString() : '—'}</p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
