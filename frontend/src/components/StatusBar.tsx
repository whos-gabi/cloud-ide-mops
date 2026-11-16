import { useEffect, useState } from 'react'

type Health = { status: string; version: string; uptime: number }

export function StatusBar() {
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: Error) => setHealthError(err.message))
  }, [])

  return (
    <footer className="status-bar">
      <div className="status-items">
        <span className="status-item">
          <span className="dot ok" />
          Frontend
        </span>
        <span className="status-item">
          <span className={`dot ${health ? 'ok' : healthError ? 'err' : 'wait'}`} />
          {health ? 'API online' : healthError ? 'API offline' : 'Se verifică...'}
        </span>
      </div>

      {health && <span className="version-tag">{health.version.slice(0, 7)}</span>}
    </footer>
  )
}