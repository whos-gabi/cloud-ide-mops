import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Se încarcă sesiunea...</div>
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}