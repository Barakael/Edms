import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

type Region = { id: number; name: string }
type Dept = { id: number; name: string; office_id?: number }
type RegistryFile = {
  id: number
  number: string
  name: string
  status: string
  office?: { name: string } | null
  department?: { name: string } | null
}

type Mode = 'existing' | 'new' | 'none'

export function FilePicker({ required = false }: { required?: boolean }) {
  const { user } = useAuth()
  const seesAll = user?.role === 'registrar' || user?.role === 'admin' || user?.role === 'senior_manager'
  const [mode, setMode] = useState<Mode>(required ? 'existing' : 'none')
  const [files, setFiles] = useState<RegistryFile[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [departments, setDepartments] = useState<Dept[]>([])
  const [officeId, setOfficeId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ files: RegistryFile[] }>('/registry-files?status=open')
      .then((r) => setFiles(r.files || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load files'))
    api<{ offices: Region[] }>('/offices')
      .then((r) => setRegions(r.offices || []))
      .catch(() => undefined)
    api<{ departments: Dept[] }>('/departments')
      .then((r) =>
        setDepartments(
          (r.departments || []).map((d) => ({
            ...d,
            id: Number(d.id),
            office_id: d.office_id == null ? undefined : Number(d.office_id),
          })),
        ),
      )
      .catch(() => undefined)
  }, [])

  const regionDepartments = departments.filter(
    (d) => officeId !== '' && Number(d.office_id) === Number(officeId),
  )

  return (
    <div className="file-picker">
      <div className="field">
        <label htmlFor="file-mode">File</label>
        <select id="file-mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          {!required && <option value="none">No file</option>}
          <option value="existing">Select existing file</option>
          <option value="new">Open new file</option>
        </select>
      </div>

      {mode === 'existing' && (
        <div className="field">
          <label htmlFor="registry_file_id">Existing file</label>
          <select id="registry_file_id" name="registry_file_id" required defaultValue="">
            <option value="" disabled>
              Select file
            </option>
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.number} — {file.name}
                {file.department?.name ? ` · ${file.department.name}` : ''}
                {file.office?.name ? ` · ${file.office.name}` : ''}
              </option>
            ))}
          </select>
          {files.length === 0 && (
            <p className="muted" style={{ marginTop: '0.35rem' }}>
              No open files yet. Open a new file instead.
            </p>
          )}
        </div>
      )}

      {mode === 'new' && (
        <>
          <div className="field">
            <label htmlFor="new_file_number">New file no.</label>
            <input id="new_file_number" name="new_file_number" required />
          </div>
          <div className="field">
            <label htmlFor="new_file_name">New file name</label>
            <input id="new_file_name" name="new_file_name" required />
          </div>
          {seesAll ? (
            <>
              <div className="field file-picker-region">
                <label htmlFor="new_file_office_id">Region</label>
                <select
                  id="new_file_office_id"
                  name="new_file_office_id"
                  required
                  value={officeId}
                  onChange={(e) => setOfficeId(e.target.value)}
                >
                  <option value="" disabled>
                    Select region
                  </option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="new_file_department_id">File department</label>
                <select id="new_file_department_id" name="new_file_department_id" required defaultValue="">
                  <option value="" disabled>
                    {regionDepartments.length ? 'Select department' : 'Select a region first'}
                  </option>
                  {regionDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : user?.department_id ? (
            <input type="hidden" name="new_file_department_id" value={user.department_id} />
          ) : null}
        </>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
