import { useMemo, useState, type ReactNode } from 'react'
import './ExpandableList.css'

type Props<T> = {
  title: string
  items: T[]
  pageSize?: number
  emptyText?: string
  renderItem: (item: T) => ReactNode
  getKey: (item: T) => string | number
}

export function ExpandableList<T>({
  title,
  items,
  pageSize = 4,
  emptyText = 'None yet.',
  renderItem,
  getKey,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)

  const preview = useMemo(() => items.slice(0, pageSize), [items, pageSize])
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const modalSlice = useMemo(() => {
    const start = page * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize])

  return (
    <div className="expand-list panel">
      <div className="expand-list-head">
        <h3>{title}</h3>
        <span className="muted">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="muted expand-empty">{emptyText}</p>
      ) : (
        <ul className="expand-preview">
          {preview.map((item) => (
            <li key={getKey(item)}>{renderItem(item)}</li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <button type="button" className="btn btn-secondary expand-more" onClick={() => { setPage(0); setOpen(true) }}>
          {items.length > pageSize ? `View more (${items.length})` : 'View all'}
        </button>
      )}

      {open && (
        <div className="expand-backdrop" role="dialog" aria-modal="true">
          <div className="expand-modal">
            <header className="expand-modal-head">
              <strong>{title}</strong>
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </header>
            <ul className="expand-modal-list">
              {modalSlice.map((item) => (
                <li key={getKey(item)}>{renderItem(item)}</li>
              ))}
            </ul>
            {totalPages > 1 && (
              <footer className="expand-modal-foot">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </button>
                <span className="muted">
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </footer>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
