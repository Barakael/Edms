import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fetchAuthorizedBlob } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { DocumentPreviewModal } from '../components/DocumentPreviewModal'
import { ExpandableList } from '../components/ExpandableList'
import { OtpModal } from '../components/OtpModal'
import { PipelineDots, type PipelineStep } from '../components/PipelineDots'
import './DocumentDetailPage.css'

type DocDetail = {
  document: {
    id: number
    status: string
    box?: string
    locked_at?: string | null
    sensitivity: string
    current_assignee_id: number | null
    assignee_can_download?: boolean
    awaiting_registry?: boolean
    registration?: Record<string, string | null> & {
      department_relation?: { name: string }
    }
    registry_file?: { id: number; number: string; name: string; status: string } | null
    files: Array<{ id: number; original_filename: string; mime: string; sort_order: number }>
    comments: Array<{
      id: number
      body: string
      created_at: string
      user?: { name: string }
      attachments?: Array<{ id: number; original_filename: string }>
    }>
    workflow_events: Array<{
      id: number
      action: string
      created_at: string
      from_user?: { name: string }
      to_user?: { name: string }
    }>
    signature_placements: Array<{
      id: number
      document_file_id: number
      page: number
      x_pct: number
      y_pct: number
      signature?: { ink_data: string }
    }>
  }
  pipeline?: PipelineStep[]
  watermark_name: string
  can_download?: boolean
  assignee_can_download?: boolean
  disclaimer: string
}

type Assignee = { id: number; name: string; role: string }

export function DocumentDetailPage() {
  const { id } = useParams()
  const { user, refreshMe } = useAuth()
  const [data, setData] = useState<DocDetail | null>(null)
  const [fileId, setFileId] = useState<number | null>(null)
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [assigneeId, setAssigneeId] = useState('')
  const [comment, setComment] = useState('')
  const [commentFile, setCommentFile] = useState<File | null>(null)
  const [commentOpen, setCommentOpen] = useState(false)
  const [directDeptId, setDirectDeptId] = useState('')
  const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([])
  const commentFileRef = useRef<HTMLInputElement>(null)
  const commentBarRef = useRef<HTMLFormElement>(null)
  const [placeMode, setPlaceMode] = useState(false)
  const [dragSign, setDragSign] = useState(false)
  const [otpOpen, setOtpOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [signToken, setSignToken] = useState<string | null>(null)
  const [pendingPlace, setPendingPlace] = useState<'click' | 'drag' | null>(null)
  const [signatureInk, setSignatureInk] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [stepUpPassword, setStepUpPassword] = useState('')

  const doc = data?.document
  const isAssignee = user && doc && user.id === doc.current_assignee_id
  const isRegistry = user?.role === 'registrar' || user?.role === 'admin'
  const isSenior = user?.role === 'senior_manager'
  const sharesUp = user?.role === 'staff' || user?.role === 'hod'
  const isHod = user?.role === 'hod'
  const archived = doc?.box === 'archive' || doc?.status === 'closed'
  const locked = Boolean(doc?.locked_at)
  const canDownload = Boolean(data?.can_download)
  const assigneeCanDownload = Boolean(
    data?.assignee_can_download ?? doc?.assignee_can_download,
  )

  async function load() {
    const res = await api<DocDetail>(`/documents/${id}`)
    setData(res)
    setFileId((prev) => {
      if (prev && res.document.files.some((f) => f.id === prev)) return prev
      return res.document.files[0]?.id ?? null
    })
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message))
    api<{ users: Assignee[] }>('/users/assignees')
      .then((r) => setAssignees(r.users))
      .catch(() => undefined)
    api<{ signature: { ink_data: string } | null }>('/signature')
      .then((r) => setSignatureInk(r.signature?.ink_data || null))
      .catch(() => undefined)
    if (user?.role === 'hod') {
      api<{ departments: Array<{ id: number; name: string }> }>('/departments')
        .then((r) => setDepartments((r.departments || []).filter((d) => d.id !== user.department_id)))
        .catch(() => undefined)
    }
  }, [id, user?.role, user?.department_id])

  async function assign(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api(`/documents/${id}/assign`, {
        method: 'POST',
        body: JSON.stringify(isRegistry ? { assignee_id: Number(assigneeId) } : {}),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed')
    }
  }

  async function shareUp() {
    setError('')
    try {
      await api(`/documents/${id}/assign`, { method: 'POST', body: JSON.stringify({}) })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share failed')
    }
  }

  async function directToDepartment(e: FormEvent) {
    e.preventDefault()
    if (!directDeptId) return
    setError('')
    try {
      await api(`/documents/${id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ department_id: Number(directDeptId) }),
      })
      setDirectDeptId('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not direct to department')
    }
  }

  async function setLock(lock: boolean) {
    setError('')
    try {
      await api(`/documents/${id}/${lock ? 'lock' : 'unlock'}`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update lock')
    }
  }

  async function downloadComments() {
    try {
      const blob = await fetchAuthorizedBlob(`/documents/${id}/comments/pdf`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `comments-${id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download comments')
    }
  }

  async function submitComment(e?: FormEvent) {
    e?.preventDefault()
    if (!comment.trim()) return
    try {
      const fd = new FormData()
      fd.set('body', comment)
      if (commentFile) fd.set('attachment', commentFile)
      await api(`/documents/${id}/comments`, { method: 'POST', body: fd })
      setComment('')
      setCommentFile(null)
      setCommentOpen(false)
      if (commentFileRef.current) commentFileRef.current.value = ''
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comment failed')
    }
  }

  async function closeDoc() {
    try {
      await api(`/documents/${id}/close`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Close failed')
    }
  }

  async function softDelete() {
    if (!confirm('Soft-delete this document?')) return
    try {
      await api(`/documents/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function stepUp(e: FormEvent) {
    e.preventDefault()
    try {
      await api('/auth/step-up', {
        method: 'POST',
        body: JSON.stringify({ password: stepUpPassword }),
      })
      await refreshMe()
      await load()
      setStepUpPassword('')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Step-up failed')
    }
  }

  const signature2fa = Boolean(user?.signature_2fa_enabled)

  function beginSign(mode: 'click' | 'drag') {
    setError('')
    setPendingPlace(mode)
    if (mode === 'drag' && !signatureInk) {
      setError('Save a signature under Signature first, then drag it onto the document.')
      return
    }
    if (!signature2fa || signToken) {
      setPreviewOpen(true)
      setPlaceMode(mode === 'click')
      setDragSign(mode === 'drag')
      return
    }
    // OTP required when signature 2FA is enabled
    setOtpOpen(true)
  }

  function onOtpVerified(token: string) {
    setSignToken(token)
    setPreviewOpen(true)
    setPlaceMode(pendingPlace === 'click')
    setDragSign(pendingPlace === 'drag')
  }

  async function onPlace(coords: { page: number; x_pct: number; y_pct: number }) {
    if (!fileId) return
    if (signature2fa && !signToken) {
      setOtpOpen(true)
      return
    }
    if (!signatureInk) {
      setError('No saved signature profile. Capture one under Signature first.')
      return
    }
    // Optimistic ink so the user sees the mark immediately
    const tempId = -Date.now()
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        document: {
          ...prev.document,
          signature_placements: [
            ...prev.document.signature_placements,
            {
              id: tempId,
              document_file_id: fileId,
              page: coords.page,
              x_pct: coords.x_pct,
              y_pct: coords.y_pct,
              signature: { ink_data: signatureInk },
            },
          ],
        },
      }
    })
    try {
      await api(`/documents/${id}/signatures`, {
        method: 'POST',
        body: JSON.stringify({
          document_file_id: fileId,
          ...coords,
          ...(signature2fa && signToken ? { sign_token: signToken } : {}),
        }),
      })
      setPlaceMode(false)
      setDragSign(false)
      setSignToken(null)
      setPendingPlace(null)
      await load()
    } catch (err) {
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          document: {
            ...prev.document,
            signature_placements: prev.document.signature_placements.filter((p) => p.id !== tempId),
          },
        }
      })
      setError(err instanceof Error ? err.message : 'Sign failed')
    }
  }

  async function downloadFile() {
    if (!fileId || !canDownload) return
    try {
      const blob = await fetchAuthorizedBlob(`/files/${fileId}/download`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc?.files.find((f) => f.id === fileId)?.original_filename || 'document'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  async function toggleAssigneeDownload(checked: boolean) {
    setError('')
    try {
      await api(`/documents/${id}/download-permission`, {
        method: 'POST',
        body: JSON.stringify({ assignee_can_download: checked }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update download permission')
    }
  }

  async function movePlacement(placementId: number, coords: { x_pct: number; y_pct: number }) {
    setError('')
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        document: {
          ...prev.document,
          signature_placements: prev.document.signature_placements.map((p) =>
            p.id === placementId ? { ...p, ...coords } : p,
          ),
        },
      }
    })
    if (placementId < 0) return
    try {
      await api(`/documents/${id}/signatures/${placementId}`, {
        method: 'PUT',
        body: JSON.stringify(coords),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move signature')
      await load()
    }
  }

  async function deletePlacement(placementId: number) {
    setError('')
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        document: {
          ...prev.document,
          signature_placements: prev.document.signature_placements.filter((p) => p.id !== placementId),
        },
      }
    })
    if (placementId < 0) return
    try {
      await api(`/documents/${id}/signatures/${placementId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove signature')
      await load()
    }
  }

  if (!doc) {
    return (
      <div className="doc-page">
        {error ? <p className="error-text">{error}</p> : <p className="muted">Loading…</p>}
        {error?.toLowerCase().includes('step-up') && (
          <form className="panel" style={{ padding: '1rem', maxWidth: 420 }} onSubmit={stepUp}>
            <p className="muted">Re-enter password to open sensitive content.</p>
            <div className="field">
              <label htmlFor="stepup">Password</label>
              <input
                id="stepup"
                type="password"
                value={stepUpPassword}
                onChange={(e) => setStepUpPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit">
              Verify
            </button>
          </form>
        )}
      </div>
    )
  }

  const activeFile = doc.files.find((f) => f.id === fileId) || doc.files[0]
  const deptLabel =
    doc.registration?.department_relation?.name || doc.registration?.department || '—'

  const regEntries = Object.entries(doc.registration || {}).filter(
    ([k]) =>
      ![
        'id',
        'document_id',
        'created_at',
        'updated_at',
        'department',
        'department_id',
        'department_relation',
      ].includes(k),
  )

  return (
    <div className="doc-page">
      <OtpModal open={otpOpen} onClose={() => setOtpOpen(false)} onVerified={onOtpVerified} />
      {activeFile && data && previewOpen && (
        <DocumentPreviewModal
          open={previewOpen}
          onClose={() => {
            setPreviewOpen(false)
            setPlaceMode(false)
            setDragSign(false)
          }}
          fileId={activeFile.id}
          mime={activeFile.mime}
          filename={activeFile.original_filename}
          watermarkName={data.watermark_name}
          placements={doc.signature_placements}
          placeMode={placeMode}
          dragSignEnabled={dragSign}
          signatureInk={signatureInk}
          canDownload={canDownload}
          onDownload={() => void downloadFile()}
          onPlace={onPlace}
          editablePlacements={Boolean((isAssignee || isRegistry) && !archived)}
          onMovePlacement={(pid, coords) => void movePlacement(pid, coords)}
          onDeletePlacement={(pid) => void deletePlacement(pid)}
          actions={
            isAssignee && doc.box === 'inbox' && !locked ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => beginSign('click')}>
                  Place signature
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => beginSign('drag')}>
                  Drag signature
                </button>
                {error && <span className="doc-modal-error">{error}</span>}
                {placeMode && <span className="badge">Click the page to place</span>}
                {dragSign && <span className="badge">Drag signature onto the page</span>}
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  Drag a placed signature to move · − to remove
                </span>
              </>
            ) : undefined
          }
        />
      )}

      <header className="doc-page-header">
        <div>
          <h1>{doc.registration?.reference_number || `Document #${doc.id}`}</h1>
          <p className="muted doc-disclaimer">{data?.disclaimer}</p>
          <div className="doc-badges">
            <span className="badge">{doc.box === 'preview' ? 'Preview Box' : doc.box === 'archive' ? 'Archives' : 'Inbox'}</span>
            <span className="badge">{doc.status.replaceAll('_', ' ')}</span>
            {locked && <span className="badge badge-sensitive">locked</span>}
            {(doc.sensitivity === 'sensitive' || doc.sensitivity === 'bank_sensitive') && (
              <span className="badge badge-sensitive">sensitive</span>
            )}
          </div>
        </div>
        <div className="doc-open-actions">
          {doc.files.length > 1 && (
            <select
              className="doc-file-select"
              value={fileId ?? ''}
              onChange={(e) => setFileId(Number(e.target.value))}
              aria-label="Select file"
            >
              {doc.files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.original_filename}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!activeFile}
            onClick={() => setPreviewOpen(true)}
          >
            {isAssignee && doc.box === 'inbox' ?'View document' : 'Open'}
          </button>
        </div>
      </header>

      {!activeFile && <p className="muted">No files attached.</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="doc-page-grid">
        <section className="doc-page-main">
          <div className="panel doc-pipeline-panel">
            <h3>Mail movement</h3>
            <PipelineDots steps={data?.pipeline || []} />
          </div>

          <div className="doc-feed-row">
            <div className="doc-feed-col">
              <ExpandableList
                title="Minutes"
                items={[...doc.comments].reverse()}
                pageSize={4}
                emptyText="No minutes yet."
                getKey={(c) => c.id}
                renderItem={(c) => (
                  <div className="doc-comment-item">
                    <strong className="doc-comment-author">{c.user?.name}</strong>
                    <div className="doc-comment-body" style={{ whiteSpace: 'pre-wrap' }}>
                      {c.body}
                    </div>
                    {c.attachments?.map((file) => (
                      <div key={file.id} className="doc-comment-attachment">
                        Attachment: {file.original_filename}
                      </div>
                    ))}
                    <div className="doc-comment-time">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                )}
              />
              <button type="button" className="doc-comments-pdf" onClick={() => void downloadComments()}>
                Download Minutes PDF
              </button>
              {(isAssignee || isRegistry || isSenior || doc.box === 'preview' || doc.box === 'archive') && (
                <form
                  ref={commentBarRef}
                  className={`doc-comment-bar${commentOpen ? ' is-open' : ''}`}
                  onSubmit={(e) => void submitComment(e)}
                >
                  <input
                    ref={commentFileRef}
                    id="comment-file"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => setCommentFile(e.target.files?.[0] || null)}
                  />
                  {commentFile && (
                    <div className="doc-comment-chip">
                      <span>{commentFile.name}</span>
                      <button
                        type="button"
                        aria-label="Remove attachment"
                        onClick={() => {
                          setCommentFile(null)
                          if (commentFileRef.current) commentFileRef.current.value = ''
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="doc-comment-row">
                    <button
                      type="button"
                      className={`doc-comment-attach${commentFile ? ' has-file' : ''}`}
                      aria-label="Attach a file"
                      onClick={() => commentFileRef.current?.click()}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.82-2.83l8.49-8.48"
                        />
                      </svg>
                    </button>
                    <input
                      id="comment"
                      className="doc-comment-input"
                      value={comment}
                      onChange={(e) => {
                        setComment(e.target.value)
                        if (!commentOpen) setCommentOpen(true)
                      }}
                      onFocus={() => setCommentOpen(true)}
                      placeholder="Write a minute…"
                      aria-label="Comment"
                      readOnly={commentOpen}
                      onClick={() => setCommentOpen(true)}
                    />
                    <button
                      className="doc-comment-send"
                      type="submit"
                      aria-label="Send comment"
                      disabled={!comment.trim()}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 12h14M13 6l6 6-6 6"
                        />
                      </svg>
                    </button>
                  </div>
                  {commentOpen && (
                    <div className="doc-comment-popover" role="dialog" aria-label="Write minute">
                      <textarea
                        className="doc-comment-textarea"
                        value={comment}
                        autoFocus
                        rows={5}
                        maxLength={5000}
                        placeholder="Write a longer minute. Line breaks are kept."
                        onChange={(e) => setComment(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault()
                            void submitComment()
                          }
                          if (e.key === 'Escape') setCommentOpen(false)
                        }}
                      />
                      <div className="doc-comment-popover-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setCommentOpen(false)}
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!comment.trim()}
                          onClick={() => void submitComment()}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>
            <ExpandableList
              title="History"
              items={[...doc.workflow_events].reverse()}
              pageSize={4}
              emptyText="No history yet."
              getKey={(ev) => ev.id}
              renderItem={(ev) => (
                <>
                  <strong>{ev.action}</strong> — {ev.from_user?.name || 'system'}
                  {ev.to_user ? ` → ${ev.to_user.name}` : ''}
                  <div className="muted">{new Date(ev.created_at).toLocaleString()}</div>
                </>
              )}
            />
          </div>
        </section>

        <aside className="doc-page-aside">
          <div className="panel doc-aside-panel">
            <h3>Registration</h3>
            <dl className="doc-reg-list">
              <div>
                <strong>file</strong>
                <span>
                  {doc.registry_file ? (
                    <Link to={`/files/${doc.registry_file.id}`}>
                      {doc.registry_file.number} — {doc.registry_file.name}
                    </Link>
                  ) : (
                    doc.registration?.file_number || '—'
                  )}
                </span>
              </div>
              <div>
                <strong>department</strong>
                <span>{deptLabel}</span>
              </div>
              {regEntries
                .filter(([k]) => k !== 'file_number')
                .slice(0, 5)
                .map(([k, v]) => (
                <div key={k}>
                  <strong>{k.replace(/_/g, ' ')}</strong>
                  <span>{typeof v === 'object' && v !== null ? '—' : String(v ?? '—')}</span>
                </div>
              ))}
            </dl>
          </div>

          {isRegistry && (
            <div className="panel doc-aside-panel">
              <h3>Download permission</h3>
              <label className="doc-download-grant">
                <input
                  type="checkbox"
                  checked={assigneeCanDownload}
                  disabled={!doc.current_assignee_id}
                  onChange={(e) => void toggleAssigneeDownload(e.target.checked)}
                />
                Allow assignee to download
              </label>
            </div>
          )}

          {isRegistry && !archived && (
            <form className="panel doc-aside-panel" onSubmit={assign}>
              <h3>Assign to inbox</h3>
              <div className="field">
                <label htmlFor="assignee">Person</label>
                <select
                  id="assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role.replaceAll('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={locked}>
                Assign
              </button>
            </form>
          )}

          {isAssignee && sharesUp && !archived && (
            <div className="panel doc-aside-panel">
              <h3>Share</h3>
              <p className="muted">
                {isHod
                  ? 'Send this mail to the Preview Box for registry and senior managers.'
                  : 'This mail goes to your Head of Department.'}
              </p>
              <button className="btn btn-primary" type="button" disabled={locked} onClick={() => void shareUp()}>
                {isHod ? 'Send to Preview Box' : 'Share'}
              </button>
            </div>
          )}

          {isAssignee && isHod && !archived && (
            <form className="panel doc-aside-panel" onSubmit={(e) => void directToDepartment(e)}>
              <h3>Direct to department</h3>
              <p className="muted">Send this mail to another department’s Head of Department.</p>
              <div className="field">
                <label htmlFor="direct-dept">Department</label>
                <select
                  id="direct-dept"
                  value={directDeptId}
                  onChange={(e) => setDirectDeptId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select department
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={locked || !directDeptId}>
                Direct
              </button>
            </form>
          )}

          {(isAssignee || isRegistry || isSenior) && !archived && (
            <button type="button" className="btn btn-primary" onClick={() => void closeDoc()}>
              Move to archive
            </button>
          )}

          {isRegistry && (
            <button type="button" className="btn btn-secondary" onClick={() => void setLock(!locked)}>
              {locked ? 'Unlock' : 'Lock'}
            </button>
          )}

          {isRegistry && (
            <button type="button" className="btn btn-danger" onClick={() => void softDelete()}>
              Soft-delete
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}
