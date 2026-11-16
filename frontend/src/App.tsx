import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

type Health = { status: string; version: string; uptime: number }
type UserView = { id: string; email: string; createdAt: string }

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  const [user, setUser] = useState<UserView | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: Error) => setHealthError(err.message))

    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<{ user: UserView }>) : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setCheckingAuth(false))
  }, [])

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode)
    setMessage(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setSubmitting(true)

    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setMessage({
          type: 'err',
          text: data?.message || data?.error || `Eroare HTTP ${res.status}`,
        })
        return
      }

      if (mode === 'register') {
        setMode('login')
        setPassword('')
        setMessage({
          type: 'ok',
          text: 'Cont creat cu succes. Te poți autentifica acum.',
        })
      } else {
        setUser(data.user)
        setPassword('')
      }
    } catch {
      setMessage({ type: 'err', text: 'Nu s-a putut contacta serverul.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    setMessage(null)
  }

  return (
    <div className="layout">
      <header className="brand">
        <span className="brand-badge">&lt;/&gt; Workspace</span>
        <h1>Cloud IDE</h1>
        <p className="tagline">Scrii, rulezi și imporți cod din GitHub, direct din browser.</p>
      </header>

      <main className="card">
        {checkingAuth ? (
          <div className="loading-state">Se verifică sesiunea...</div>
        ) : user ? (
          <div>
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
                <span className="meta-value">{user.id.slice(0, 8)}...{user.id.slice(-4)}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Membru din</span>
                <span className="meta-value">
                  {new Date(user.createdAt).toLocaleDateString('ro-RO')}
                </span>
              </div>
            </div>

            <button type="button" className="btn-danger" onClick={handleLogout}>
              Deconectare
            </button>
          </div>
        ) : (
          <div>
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={`tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => switchMode('login')}
              >
                Autentificare
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                className={`tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => switchMode('register')}
              >
                Cont nou
              </button>
            </div>

            {message && (
              <div className={`alert ${message.type}`}>
                {message.text}
              </div>
            )}

            <form className="form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="email">Adresă de email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nume@exemplu.ro"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="password">Parolă</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting
                  ? 'Se procesează...'
                  : mode === 'login'
                    ? 'Intră în workspace'
                    : 'Creează cont'}
              </button>
            </form>
          </div>
        )}
      </main>

      <footer className="status-bar">
        <div className="status-items">
          <span className="status-item">
            <span className="dot ok" />
            Frontend
          </span>
          <span className="status-item">
            <span className={`dot ${health ? 'ok' : healthError ? 'err' : 'wait'}`} />
            {health ? 'API online' : healthError ? `API offline` : 'Se verifică...'}
          </span>
        </div>

        {health && (
          <span className="version-tag">{health.version.slice(0, 7)}</span>
        )}
      </footer>
    </div>
  )
}