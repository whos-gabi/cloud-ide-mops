import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute() {
  const { user, isLoading, logout } = useAuth()
  const location = useLocation()
  const [loggingOut, setLoggingOut] = useState(false)

  if (isLoading) {
    return (
      <div className="layout">
        <main className="card">
          <div className="loading-state">Se verifică sesiunea...</div>
        </main>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="protected-shell">
      <nav className="topbar">
        <div className="topbar-brand">
          <span className="brand-badge topbar-badge">&lt;/&gt; Workspace</span>
          <span className="topbar-title">Cloud IDE</span>
        </div>

        <div className="topbar-actions">
          <span className="topbar-user">{user.email}</span>
          <button
            type="button"
            className="btn-logout-sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Se deconectează...' : 'Deconectare'}
          </button>
        </div>
      </nav>

      <Outlet />
    </div>
  )
}