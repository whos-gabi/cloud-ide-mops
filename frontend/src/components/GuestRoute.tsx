import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function GuestRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Se încarcă sesiunea...</div>
  }

  return user ? <Navigate to="/dashboard" replace /> : <Outlet />
}