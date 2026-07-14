import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthResponse, AuthUser } from '@/types'

const AUTH_SESSION_KEY = 'authSession'

interface StoredSession extends AuthUser {
  token: string
}

function loadStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(AUTH_SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

interface AuthContextValue {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  setSession: (data: AuthResponse) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<StoredSession | null>(() => loadStoredSession())

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_SESSION_KEY)
    setSessionState(null)
  }, [])

  // A 401 on an authenticated request (dispatched by the http client) means
  // the token is gone/expired — drop the session. ProtectedRoute then bounces
  // the user to /login.
  useEffect(() => {
    window.addEventListener('auth:unauthorized', logout)
    return () => window.removeEventListener('auth:unauthorized', logout)
  }, [logout])

  const value = useMemo<AuthContextValue>(() => {
    return {
      token: session?.token ?? null,
      user: session ? { userId: session.userId, email: session.email, name: session.name, role: session.role } : null,
      isAuthenticated: !!session,
      setSession: (data: AuthResponse) => {
        const next: StoredSession = {
          token: data.accessToken,
          userId: data.userId,
          email: data.email,
          name: data.name,
          role: data.role,
        }
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next))
        setSessionState(next)
      },
      logout,
    }
  }, [session, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
