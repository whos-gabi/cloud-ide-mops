import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { StatusBar } from '../components/StatusBar'
import { useAuth } from '../context/AuthContext'

interface LocationState {
  registeredEmail?: string
  notice?: string
  from?: { pathname: string }
}

type FieldErrors = {
  email?: string
  password?: string
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState | null) ?? null

  const [email, setEmail] = useState(state?.registeredEmail ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setSubmitting(true)

    try {
      await login({ email: email.trim().toLowerCase(), password })
      const destination = state?.from?.pathname || '/dashboard'
      navigate(destination, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields && Object.keys(err.fields).length > 0) {
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
        <p className="tagline">Scrii, rulezi și imporți cod din GitHub, direct din browser.</p>
      </header>

      <main className="card">
        <div className="tabs">
          <span className="tab active">Autentificare</span>
          <Link to="/register" className="tab">
            Cont nou
          </Link>
        </div>

        {state?.notice && !error && <div className="alert ok">{state.notice}</div>}
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
              autoComplete="current-password"
              placeholder="••••••••"
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

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Se conectează...' : 'Intră în workspace'}
          </button>
        </form>
      </main>

      <StatusBar />
    </div>
  )
}