import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'

export function ProtectedRoute({ requireAdmin = false }: { requireAdmin?: boolean }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Admin-gated routes: non-admins are bounced to the dashboard rather than
  // shown a page whose every API call would 403 server-side.
  if (requireAdmin && user?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
