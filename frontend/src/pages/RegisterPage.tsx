import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { StatusBar } from '../components/StatusBar'
import { useAuth } from '../context/AuthContext'

type FieldErrors = {
  email?: string
  password?: string
  confirmPassword?: string
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    if (password.length < 8) {
      setFieldErrors({ password: 'Parola trebuie să conțină cel puțin 8 caractere.' })
      return
    }

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Parolele nu coincid.' })
      return
    }

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
          setFieldErrors({ email: 'Există deja un cont cu acest email.' })
        } else if (err.fields && Object.keys(err.fields).length > 0) {
          setFieldErrors({
            email: err.fields.email,
            password: err.fields.password,
          })
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
              onChange={(e) => {
                setEmail(e.target.value)
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }))
              }}
              aria-invalid={Boolean(fieldErrors.email)}
              className={fieldErrors.email ? 'input-error' : undefined}
              required
            />
            {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
          </div>

          <div className="field">
            <label htmlFor="password">Parolă</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Minim 8 caractere"
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }))
              }}
              aria-invalid={Boolean(fieldErrors.password)}
              className={fieldErrors.password ? 'input-error' : undefined}
              required
            />
            {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Confirmă parola</label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Repetă parola"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (fieldErrors.confirmPassword) {
                  setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                }
              }}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              className={fieldErrors.confirmPassword ? 'input-error' : undefined}
              required
            />
            {fieldErrors.confirmPassword && (
              <span className="field-error">{fieldErrors.confirmPassword}</span>
            )}
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