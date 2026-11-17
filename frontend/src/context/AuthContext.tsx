import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi } from '../api/auth.api'
import { setUnauthenticatedHandler } from '../api/client'
import type { AuthCredentials, UserView } from '../types/auth'

interface AuthContextValue {
  user: UserView | null
  isLoading: boolean
  login: (input: AuthCredentials) => Promise<void>
  register: (input: AuthCredentials) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserView | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Any request that finds the session gone logs the user out here too;
  // ProtectedRoute then sends them to the login page.
  useEffect(() => {
    setUnauthenticatedHandler(() => setUser(null))
    return () => setUnauthenticatedHandler(null)
  }, [])

  useEffect(() => {
    let active = true

    const verifySession = () => {
      authApi
        .me()
        .then((res) => {
          if (active) setUser(res.user)
        })
        .catch(() => {
          if (active) setUser(null)
        })
        .finally(() => {
          if (active) setIsLoading(false)
        })
    }

    verifySession()

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setIsLoading(true)
        verifySession()
      }
    }

    window.addEventListener('pageshow', handlePageShow)

    return () => {
      active = false
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  const login = async (input: AuthCredentials) => {
    const res = await authApi.login(input)
    setUser(res.user)
  }

  const register = async (input: AuthCredentials) => {
    await authApi.register(input)
  }

  const logout = async () => {
    await authApi.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth trebuie utilizat în interiorul AuthProvider')
  return ctx
}