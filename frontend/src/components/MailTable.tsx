import { Link } from 'react-router-dom'
import { TablePager, usePagedRows } from './TablePager'
import '../pages/InboxPage.css'

export type MailDoc = {
  id: number
  status: string
  box?: string
  updated_at?: string
  registration?: {
    mail_type?: string | null
    mail_subject?: string | null
    mail_subject_type?: string | null
    sender_or_origin?: string | null
    file_number?: string | null
    folio_number?: string | null
    received_date?: string | null
    mail_priority?: string | null
    volume?: string | null
    department?: string | null
    department_relation?: { name?: string } | null
  }
}

const PRIORITY: Record<string, string> = {
  normal: 'NORMAL',
  urgent: 'URGENT',
  very_urgent: 'VERY URGENT',
}

function stamp(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function day(value?: string | null) {
  if (!value) return '—'
  return value.slice(0, 10)
}

export function MailTable({
  docs,
  empty,
  showDepartment = false,
}: {
  docs: MailDoc[]
  empty: string
  showDepartment?: boolean
}) {
  const { page, setPage, slice, total, pageSize } = usePagedRows(docs)

  return (
    <div className="panel mail-wrap">
      <div className="mail-scroll">
        <table className="table mail-table">
          <thead>
            <tr>
              <th>Activity entry</th>
              <th>Mail type</th>
              {showDepartment && <th>Department</th>}
              <th>Mail from</th>
              <th>Mail subject</th>
              <th>File no.</th>
              <th>Mail date</th>
              <th>Mail folio no.</th>
              <th>Mail priority</th>
              <th>Volume</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {slice.map((d) => {
              const reg = d.registration
              const priority = reg?.mail_priority || 'normal'
              const mailType =
                reg?.mail_type === 'MEMO' ? 'Internal memo' : reg?.mail_type || '—'
              const dept =
                reg?.department_relation?.name || reg?.department || '—'
              return (
                <tr key={d.id}>
                  <td>{stamp(d.updated_at)}</td>
                  <td>{mailType}</td>
                  {showDepartment && <td>{dept}</td>}
                  <td>{reg?.sender_or_origin || '—'}</td>
                  <td className="mail-subject">{reg?.mail_subject || reg?.mail_subject_type || '—'}</td>
                  <td>{reg?.file_number || '—'}</td>
                  <td>{day(reg?.received_date)}</td>
                  <td>{reg?.folio_number || '—'}</td>
                  <td>
                    <span className={`mail-priority priority-${priority}`}>{PRIORITY[priority] || priority}</span>
                  </td>
                  <td>{reg?.volume || '—'}</td>
                  <td>
                    <Link to={`/documents/${d.id}`}>Open</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!docs.length && <p className="muted inbox-empty">{empty}</p>}
      </div>
      <TablePager page={page} setPage={setPage} total={total} pageSize={pageSize} />
    </div>
  )
}
