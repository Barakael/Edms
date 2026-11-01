import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/Toast'
import { ArchivePage } from './pages/ArchivePage'
import { RegionsPage } from './pages/RegionsPage'
import { DepartmentsPage } from './pages/DepartmentsPage'
import { DocumentDetailPage } from './pages/DocumentDetailPage'
import { DownloadAccessPage } from './pages/DownloadAccessPage'
import { DownloadRequestsPage } from './pages/DownloadRequestsPage'
import { BulkUploadsPage } from './pages/BulkUploadsPage'
import { EmailDraftsPage } from './pages/EmailDraftsPage'
import { FileDetailPage } from './pages/FileDetailPage'
import { FilesPage } from './pages/FilesPage'
import { InboxPage } from './pages/InboxPage'
import { LoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { QueuePage } from './pages/QueuePage'
import { RegisterPage } from './pages/RegisterPage'
import { SearchPage } from './pages/SearchPage'
import { SignPadPage } from './pages/SignPadPage'
import { SettingsPage } from './pages/SettingsPage'
import { SignaturePage } from './pages/SignaturePage'
import { SubmitPage } from './pages/SubmitPage'
import { RolesPage } from './pages/RolesPage'
import { UsersPage } from './pages/UsersPage'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted" style={{ padding: '2rem' }}>Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sign-pad/:token" element={<SignPadPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<InboxPage />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="files/:id" element={<FileDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="submit" element={<SubmitPage />} />
          <Route path="email-drafts" element={<EmailDraftsPage />} />
          <Route path="bulk-uploads" element={<BulkUploadsPage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path="regions" element={<RegionsPage />} />
          <Route path="branches" element={<Navigate to="/regions" replace />} />
          <Route path="stations" element={<Navigate to="/departments" replace />} />
          <Route path="staff" element={<UsersPage />} />
          <Route path="users" element={<Navigate to="/staff" replace />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="download-requests" element={<DownloadRequestsPage />} />
          <Route path="download-access" element={<DownloadAccessPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="signature" element={<SignaturePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="documents/:id" element={<DocumentDetailPage />} />
        </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
