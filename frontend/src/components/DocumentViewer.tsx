import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fetchAuthorizedBlob } from '../api/client'
import './DocumentViewer.css'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

type Placement = {
  id: number
  document_file_id: number
  page: number
  x_pct: number
  y_pct: number
  signature?: { ink_data: string }
}

type Props = {
  fileId: number
  mime: string
  watermarkName: string
  placements?: Placement[]
  placeMode?: boolean
  canDownload?: boolean
  onDownload?: () => void
  onPlace?: (coords: { page: number; x_pct: number; y_pct: number }) => void
  dragSignEnabled?: boolean
  signatureInk?: string | null
  /** Allow − delete and drag-to-move on placed signatures */
  editablePlacements?: boolean
  onMovePlacement?: (id: number, coords: { x_pct: number; y_pct: number }) => void
  onDeletePlacement?: (id: number) => void
}

function isPdfMime(mime: string) {
  return mime === 'application/pdf' || mime.includes('pdf')
}

function isImageMime(mime: string) {
  return mime.startsWith('image/')
}

export function DocumentViewer({
  fileId,
  mime,
  watermarkName,
  placements = [],
  placeMode,
  canDownload = false,
  onDownload,
  onPlace,
  dragSignEnabled,
  signatureInk,
  editablePlacements = false,
  onMovePlacement,
  onDeletePlacement,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const renderGenRef = useRef(0)
  const movingRef = useRef<{ id: number; pointerId: number } | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [pdfEpoch, setPdfEpoch] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [localPos, setLocalPos] = useState<Record<number, { x_pct: number; y_pct: number }>>({})

  const cancelRender = useCallback(async () => {
    const task = renderTaskRef.current
    if (!task) return
    renderTaskRef.current = null
    try {
      task.cancel()
      await task.promise.catch(() => undefined)
    } catch {
      /* ignore */
    }
  }, [])

  const renderPage = useCallback(
    async (pageNum: number) => {
      const canvas = canvasRef.current
      const pdf = pdfRef.current
      if (!canvas || !pdf || isImageMime(mime)) return

      await cancelRender()
      const gen = ++renderGenRef.current

      try {
        const pdfPage = await pdf.getPage(pageNum)
        if (gen !== renderGenRef.current) return

        const stage = stageRef.current
        const availableW = stage ? Math.max(stage.clientWidth - 48, 320) : 960
        const availableH = stage ? Math.max(stage.clientHeight - 24, 480) : 900
        const base = pdfPage.getViewport({ scale: 1 })
        // Fit page into stage in CSS pixels (true source vectors — not recompressed)
        const fitScale = Math.min(availableW / base.width, availableH / base.height)
        const cssScale = Math.min(3, Math.max(1.75, fitScale))
        const viewport = pdfPage.getViewport({ scale: cssScale })
        const dpr = Math.min(window.devicePixelRatio || 1, 3)
        const outputScale = dpr

        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) return
        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        const task = pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform,
        })
        renderTaskRef.current = task
        await task.promise
        if (gen === renderGenRef.current) {
          renderTaskRef.current = null
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('Rendering cancelled') || msg.includes('Cancelled')) return
        if (gen === renderGenRef.current) {
          setError(msg || 'Failed to render page')
        }
      }
    },
    [mime, cancelRender],
  )

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false

    async function load() {
      setError('')
      setLoading(true)
      setImageUrl(null)
      await cancelRender()
      if (pdfRef.current) {
        try {
          await pdfRef.current.loadingTask.destroy()
        } catch {
          /* ignore */
        }
      }
      pdfRef.current = null
      setPage(1)
      setPageCount(1)

      try {
        const blob = await fetchAuthorizedBlob(`/files/${fileId}/stream`)
        if (cancelled) return

        const looksImage = isImageMime(mime) || blob.type.startsWith('image/')
        const looksPdf = isPdfMime(mime) || blob.type === 'application/pdf' || !looksImage

        if (looksImage && !isPdfMime(mime)) {
          const url = URL.createObjectURL(blob)
          revoked = url
          setImageUrl(url)
          setPageCount(1)
          setLoading(false)
          return
        }

        if (looksPdf) {
          const data = await blob.arrayBuffer()
          const loadingTask = pdfjs.getDocument({ data })
          const pdf = await loadingTask.promise
          if (cancelled) {
            await loadingTask.destroy()
            return
          }
          pdfRef.current = pdf
          setPageCount(pdf.numPages)
          setPage(1)
          setPdfEpoch((n) => n + 1)
          setLoading(false)
          return
        }

        setError('Unsupported file type for preview')
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Preview failed')
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
      void cancelRender()
      if (revoked) URL.revokeObjectURL(revoked)
      const pdf = pdfRef.current
      pdfRef.current = null
      if (pdf) void pdf.loadingTask.destroy().catch(() => undefined)
    }
  }, [fileId, mime, cancelRender])

  useEffect(() => {
    if (!pdfRef.current || isImageMime(mime) || loading) return
    void renderPage(page)
    return () => {
      void cancelRender()
    }
  }, [page, pdfEpoch, mime, loading, renderPage, cancelRender])

  function placeAtClient(clientX: number, clientY: number) {
    if (!onPlace || !pageRef.current) return
    const rect = pageRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x_pct = ((clientX - rect.left) / rect.width) * 100
    const y_pct = ((clientY - rect.top) / rect.height) * 100
    if (x_pct < 0 || x_pct > 100 || y_pct < 0 || y_pct > 100) return
    onPlace({
      page,
      x_pct: Math.min(100, Math.max(0, x_pct)),
      y_pct: Math.min(100, Math.max(0, y_pct)),
    })
  }

  function handleClick(e: React.MouseEvent<HTMLElement>) {
    if (!placeMode || dragSignEnabled || movingRef.current) return
    e.preventDefault()
    e.stopPropagation()
    placeAtClient(e.clientX, e.clientY)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (!dragSignEnabled) return
    placeAtClient(e.clientX, e.clientY)
  }

  function pctFromClient(clientX: number, clientY: number) {
    if (!pageRef.current) return null
    const rect = pageRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x_pct: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y_pct: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    }
  }

  function onPlacementPointerDown(e: React.PointerEvent, id: number) {
    if (!editablePlacements || !onMovePlacement) return
    if ((e.target as HTMLElement).closest('.sig-delete')) return
    e.preventDefault()
    e.stopPropagation()
    movingRef.current = { id, pointerId: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPlacementPointerMove(e: React.PointerEvent) {
    const moving = movingRef.current
    if (!moving || moving.pointerId !== e.pointerId) return
    const pct = pctFromClient(e.clientX, e.clientY)
    if (!pct) return
    setLocalPos((prev) => ({ ...prev, [moving.id]: pct }))
  }

  function onPlacementPointerUp(e: React.PointerEvent) {
    const moving = movingRef.current
    if (!moving || moving.pointerId !== e.pointerId) return
    const pct = pctFromClient(e.clientX, e.clientY)
    movingRef.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (pct) {
      setLocalPos((prev) => ({ ...prev, [moving.id]: pct }))
      onMovePlacement?.(moving.id, pct)
    }
  }

  useEffect(() => {
    // Drop local overrides once parent placements catch up
    setLocalPos((prev) => {
      const next = { ...prev }
      let changed = false
      for (const id of Object.keys(next)) {
        const n = Number(id)
        const p = placements.find((x) => x.id === n)
        if (!p) {
          delete next[n]
          changed = true
          continue
        }
        const loc = next[n]
        if (
          loc &&
          Math.abs(loc.x_pct - p.x_pct) < 0.05 &&
          Math.abs(loc.y_pct - p.y_pct) < 0.05
        ) {
          delete next[n]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [placements])

  const filePlacements = placements.filter(
    (p) => Number(p.document_file_id) === Number(fileId) && Number(p.page) === Number(page),
  )
  const showImage = Boolean(imageUrl)

  const watermarkMarks = useMemo(() => {
    // One centered mark + three extra scattered marks (stable per file/page/name)
    const seed = `${fileId}:${page}:${watermarkName}`
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    const rand = () => {
      h = Math.imul(h ^ (h >>> 13), 1274126177)
      return ((h >>> 0) % 10000) / 10000
    }
    const extras = [0, 1, 2].map((i) => ({
      id: `wm-extra-${i}`,
      top: 18 + rand() * 64,
      left: 12 + rand() * 76,
      rotate: -42 + rand() * 28,
      size: 0.72 + rand() * 0.45,
      opacity: 0.1 + rand() * 0.08,
    }))
    return [
      { id: 'wm-main', top: 50, left: 50, rotate: -35, size: 1, opacity: 0.14 },
      ...extras,
    ]
  }, [fileId, page, watermarkName])

  return (
    <div className="viewer viewer-in-modal">
      <div className="viewer-toolbar">
        <span className="muted">In-app preview · watermarked</span>
        <div className="viewer-toolbar-actions">
          {pageCount > 1 && (
            <div className="viewer-pager">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </button>
              <span>
                {page} / {pageCount}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= pageCount || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canDownload}
            title={canDownload ? 'Download file' : 'Download disabled until registry grants access'}
            onClick={() => canDownload && onDownload?.()}
          >
            Download
          </button>
          {placeMode && <span className="badge">Click to place signature</span>}
          {dragSignEnabled && <span className="badge">Drag signature onto document</span>}
        </div>
      </div>
      {loading && <p className="muted">Loading preview…</p>}
      {error && <p className="error-text">{error}</p>}
      {dragSignEnabled && (
        <div className="drag-sign-tray">
          {signatureInk ? (
            <>
              <img
                src={signatureInk}
                alt="Your signature — drag onto document"
                className="drag-sign-chip"
                draggable
                onDragStart={(e) => {
                  setDragging(true)
                  e.dataTransfer.setData('text/plain', 'edms-signature')
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onDragEnd={() => setDragging(false)}
              />
              <span className="muted">Drag onto the page to place</span>
            </>
          ) : (
            <span className="error-text">No saved signature — capture one under Signature first.</span>
          )}
        </div>
      )}
      {placeMode && !dragSignEnabled && (
        <p className="viewer-place-hint">Click on the document page to place your signature.</p>
      )}
      <div
        className={`viewer-stage${dragging ? ' is-drop-target' : ''}${placeMode ? ' is-place-mode' : ''}`}
        ref={stageRef}
        onDragOver={(e) => {
          if (dragSignEnabled) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={onDrop}
        role="presentation"
      >
        <div
          className="viewer-page"
          ref={pageRef}
          onClick={handleClick}
          onDragOver={(e) => {
            if (dragSignEnabled) e.preventDefault()
          }}
          onDrop={onDrop}
        >
          {showImage ? (
            <img src={imageUrl!} alt="Document preview" className="viewer-image" draggable={false} />
          ) : (
            <canvas ref={canvasRef} className="viewer-canvas" />
          )}
          {watermarkMarks.map((wm) => (
            <div
              key={wm.id}
              className="watermark-diagonal"
              aria-hidden
              style={{
                top: `${wm.top}%`,
                left: `${wm.left}%`,
                opacity: wm.opacity,
                fontSize: `calc(${wm.size} * clamp(1.1rem, 3.8vw, 2.1rem))`,
                transform: `translate(-50%, -50%) rotate(${wm.rotate}deg)`,
              }}
            >
              {watermarkName}
            </div>
          ))}
          {filePlacements.map((p) => {
            if (!p.signature?.ink_data) return null
            const pos = localPos[p.id] ?? { x_pct: p.x_pct, y_pct: p.y_pct }
            return (
              <div
                key={p.id}
                className={`sig-placement${editablePlacements ? ' is-editable' : ''}`}
                style={{ left: `${pos.x_pct}%`, top: `${pos.y_pct}%` }}
                onPointerDown={(e) => onPlacementPointerDown(e, p.id)}
                onPointerMove={onPlacementPointerMove}
                onPointerUp={onPlacementPointerUp}
                onPointerCancel={onPlacementPointerUp}
              >
                {editablePlacements && (
                  <button
                    type="button"
                    className="sig-delete"
                    title="Remove signature"
                    aria-label="Remove signature"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onDeletePlacement?.(p.id)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    −
                  </button>
                )}
                <img src={p.signature.ink_data} alt="Signature" draggable={false} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
