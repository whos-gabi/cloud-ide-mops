import { useState } from 'react'
import { StatusBar } from '../components/StatusBar'
import { useAuth } from '../context/AuthContext'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  if (!user) return null

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="layout">
      <header className="brand">
        <span className="brand-badge">&lt;/&gt; Workspace</span>
        <h1>Cloud IDE</h1>
        <p className="tagline">Bine ai revenit în spațiul tău de lucru.</p>
      </header>

      <main className="card">
        <div className="profile-header">
          <div className="avatar">{user.email.slice(0, 2)}</div>
          <div>
            <div className="profile-title">{user.email}</div>
            <div className="profile-subtitle">● Sesiune activă</div>
          </div>
        </div>

        <div className="meta-list">
          <div className="meta-item">
            <span className="meta-label">ID Utilizator</span>
            <span className="meta-value">
              {user.id.slice(0, 8)}...{user.id.slice(-4)}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Membru din</span>
            <span className="meta-value">
              {new Date(user.createdAt).toLocaleDateString('ro-RO')}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn-danger"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? 'Se deconectează...' : 'Deconectare'}
        </button>
      </main>

      <StatusBar />
    </div>
  )
}