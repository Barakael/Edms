import { useEffect, useState } from 'react'
import './TablePager.css'

export const PAGE_SIZE = 10

export function usePagedRows<T>(rows: T[], pageSize = PAGE_SIZE) {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1))
  }, [page, totalPages])

  const start = total === 0 ? 0 : page * pageSize
  const end = Math.min(start + pageSize, total)

  return {
    page,
    setPage,
    pageSize,
    total,
    totalPages,
    start,
    end,
    slice: rows.slice(start, end),
  }
}

export function TablePager({
  page,
  setPage,
  total,
  pageSize = PAGE_SIZE,
}: {
  page: number
  setPage: (page: number) => void
  total: number
  pageSize?: number
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const start = total === 0 ? 0 : page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, total)

  return (
    <div className="table-pager">
      <span className="table-pager-range">
        {total === 0 ? '0 of 0' : `${start} – ${end} of ${total}`}
      </span>
      <div className="table-pager-nav">
        <button type="button" disabled={page <= 0} onClick={() => setPage(0)}>
          First
        </button>
        <span aria-hidden>|</span>
        <button type="button" disabled={page <= 0} onClick={() => setPage(page - 1)}>
          ‹ Prev
        </button>
        <span aria-hidden>|</span>
        <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
          Next ›
        </button>
        <span aria-hidden>|</span>
        <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
          Last
        </button>
      </div>
    </div>
  )
}
