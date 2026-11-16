import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'

interface LocationState {
  registeredEmail?: string
  notice?: string
  from?: { pathname: string }
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState | null) ?? null

  const [email, setEmail] = useState(state?.registeredEmail ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login({ email: email.trim().toLowerCase(), password })
      const destination = state?.from?.pathname || '/dashboard'
      navigate(destination, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Nu s-a putut contacta serverul.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={cardStyle}>
      <h1>Autentificare</h1>

      {state?.notice && !error && <div style={noticeBoxStyle}>{state.notice}</div>}
      {error && <div style={errorBoxStyle}>{error}</div>}

      <form onSubmit={handleSubmit} style={formStyle}>
        <label style={labelStyle}>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Parolă
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? 'Se conectează...' : 'Intră în cont'}
        </button>
      </form>

      <p style={{ marginTop: '1rem' }}>
        Nu ai cont? <Link to="/register">Creează un cont</Link>
      </p>
    </main>
  )
}

const cardStyle = { maxWidth: 400, margin: '4rem auto', padding: '1.5rem', border: '1px solid #ddd', borderRadius: 8 }
const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: '1rem' }
const labelStyle = { display: 'flex', flexDirection: 'column' as const, gap: '0.25rem', fontSize: '0.9rem' }
const inputStyle = { padding: '0.5rem', fontSize: '1rem' }
const buttonStyle = { padding: '0.6rem', fontSize: '1rem', cursor: 'pointer' }
const errorBoxStyle = { padding: '0.75rem', marginBottom: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: 6 }
const noticeBoxStyle = { padding: '0.75rem', marginBottom: '1rem', background: '#dcfce7', color: '#166534', borderRadius: 6 }