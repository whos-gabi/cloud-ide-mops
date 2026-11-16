import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { StatusBar } from '../components/StatusBar'
import { useAuth } from '../context/AuthContext'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const normalizedEmail = email.trim().toLowerCase()

    try {
      await register({ email: normalizedEmail, password })
      navigate('/login', {
        replace: true,
        state: {
          registeredEmail: normalizedEmail,
          notice: 'Cont creat cu succes. Te poți autentifica acum.',
        },
      })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_TAKEN' || err.status === 409) {
          setError('Există deja un cont cu acest email.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Nu s-a putut contacta serverul.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="layout">
      <header className="brand">
        <span className="brand-badge">&lt;/&gt; Workspace</span>
        <h1>Cloud IDE</h1>
        <p className="tagline">Creează un cont nou pentru a începe să lucrezi în cloud.</p>
      </header>

      <main className="card">
        <div className="tabs">
          <Link to="/login" className="tab">
            Autentificare
          </Link>
          <span className="tab active">Cont nou</span>
        </div>

        {error && <div className="alert err">{error}</div>}

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
              autoComplete="new-password"
              placeholder="Minim 8 caractere"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Se creează contul...' : 'Creează cont'}
          </button>
        </form>
      </main>

      <StatusBar />
    </div>
  )
}