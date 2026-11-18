import { StatusBar } from '../components/StatusBar'
import { useAuth } from '../context/AuthContext'

export function DashboardPage() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <div className="layout">
      <header className="brand">
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
      </main>

      <StatusBar />
    </div>
  )
}