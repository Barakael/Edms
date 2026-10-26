import { useEffect, type ReactNode } from 'react'
import { DocumentViewer } from './DocumentViewer'
import './DocumentPreviewModal.css'

type Placement = {
  id: number
  document_file_id: number
  page: number
  x_pct: number
  y_pct: number
  signature?: { ink_data: string }
}

type Props = {
  open: boolean
  onClose: () => void
  fileId: number
  mime: string
  filename?: string
  watermarkName: string
  placements?: Placement[]
  placeMode?: boolean
  canDownload?: boolean
  onDownload?: () => void
  onPlace?: (coords: { page: number; x_pct: number; y_pct: number }) => void
  dragSignEnabled?: boolean
  signatureInk?: string | null
  actions?: ReactNode
  editablePlacements?: boolean
  onMovePlacement?: (id: number, coords: { x_pct: number; y_pct: number }) => void
  onDeletePlacement?: (id: number) => void
}

export function DocumentPreviewModal({
  open,
  onClose,
  fileId,
  mime,
  filename,
  watermarkName,
  placements,
  placeMode,
  canDownload,
  onDownload,
  onPlace,
  dragSignEnabled,
  signatureInk,
  actions,
  editablePlacements,
  onMovePlacement,
  onDeletePlacement,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="doc-modal-backdrop" role="dialog" aria-modal="true" aria-label="Document preview">
      <div className="doc-modal">
        <header className="doc-modal-head">
          <div>
            <strong>{filename || 'Document preview'}</strong>
            <div className="muted">Watermarked view · Esc to close</div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </header>
        {actions && <div className="doc-modal-actions">{actions}</div>}
        <div className="doc-modal-body">
          <DocumentViewer
            fileId={fileId}
            mime={mime}
            watermarkName={watermarkName}
            placements={placements}
            placeMode={placeMode}
            canDownload={canDownload}
            onDownload={onDownload}
            onPlace={onPlace}
            dragSignEnabled={dragSignEnabled}
            signatureInk={signatureInk}
            editablePlacements={editablePlacements}
            onMovePlacement={onMovePlacement}
            onDeletePlacement={onDeletePlacement}
          />
        </div>
      </div>
    </div>
  )
}
