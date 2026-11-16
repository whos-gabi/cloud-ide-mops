import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
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
    <main style={cardStyle}>
      <h1>Creare cont</h1>

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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? 'Se creează contul...' : 'Înregistrează-te'}
        </button>
      </form>

      <p style={{ marginTop: '1rem' }}>
        Ai deja cont? <Link to="/login">Autentifică-te</Link>
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