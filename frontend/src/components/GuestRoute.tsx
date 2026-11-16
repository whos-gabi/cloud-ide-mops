import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function GuestRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="layout">
        <main className="card">
          <div className="loading-state">Se verifică sesiunea...</div>
        </main>
      </div>
    )
  }

  return user ? <Navigate to="/dashboard" replace /> : <Outlet />
}