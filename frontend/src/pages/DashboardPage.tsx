import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '1.5rem', border: '1px solid #ddd', borderRadius: 8 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Contul meu</h1>
        <button onClick={handleLogout} disabled={loggingOut} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          {loggingOut ? 'Se deconectează...' : 'Deconectare'}
        </button>
      </header>

      <dl style={{ marginTop: '1.5rem', lineHeight: 1.8 }}>
        <dt><strong>ID Utilizator:</strong></dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{user?.id}</dd>

        <dt style={{ marginTop: '0.75rem' }}><strong>Email:</strong></dt>
        <dd style={{ margin: 0 }}>{user?.email}</dd>

        <dt style={{ marginTop: '0.75rem' }}><strong>Membru din:</strong></dt>
        <dd style={{ margin: 0 }}>
          {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('ro-RO') : '-'}
        </dd>
      </dl>
    </main>
  )
}