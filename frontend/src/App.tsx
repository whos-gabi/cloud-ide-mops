import { useEffect, useState } from 'react'
import './App.css'

type Health = { status: string; version: string; uptime: number }

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main className="page">
      <h1>Cloud IDE</h1>
      <p className="tagline">Scrii, rulezi și imporți cod din GitHub, direct din browser.</p>

      <section className="status">
        <h2>Status</h2>
        <ul>
          <li>
            <span className="dot ok" /> Frontend: online
          </li>
          <li>
            <span className={`dot ${health ? 'ok' : error ? 'err' : 'wait'}`} /> Backend:{' '}
            {health ? 'online' : error ? `offline (${error})` : 'se verifică...'}
          </li>
        </ul>
        {health && (
          <p className="version">
            Versiune deployată: <code>{health.version.slice(0, 7)}</code>
          </p>
        )}
      </section>
    </main>
  )
}

export default App
