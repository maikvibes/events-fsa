import { Navigate, Route, Routes } from 'react-router-dom'
import { PushForegroundListener } from '@/features/push/foreground-listener'
import { PushAutoEnable } from '@/features/push/auto-enable'
import { AppShell } from '@/components/layout/app-shell'
import { ProtectedRoute } from '@/components/layout/protected-route'
import LoginPage from '@/pages/login-page'
import RegisterPage from '@/pages/register-page'
import DashboardPage from '@/pages/dashboard-page'
import EventsPage from '@/pages/events-page'
import EventDetailPage from '@/pages/event-detail-page'
import NewEventPage from '@/pages/new-event-page'
import EditEventPage from '@/pages/edit-event-page'
import MyEventsPage from '@/pages/my-events-page'
import NotificationsPage from '@/pages/notifications-page'
import ProfilePage from '@/pages/profile-page'
import AdminPage from '@/pages/admin-page'
import NotFoundPage from '@/pages/not-found-page'

export default function App() {
  return (
    <>
      <PushForegroundListener />
      <PushAutoEnable />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/new" element={<NewEventPage />} />
            <Route path="events/:eventId" element={<EventDetailPage />} />
            <Route path="events/:eventId/edit" element={<EditEventPage />} />
            <Route path="my-events" element={<MyEventsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route element={<ProtectedRoute requireAdmin />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </>
  )
}
