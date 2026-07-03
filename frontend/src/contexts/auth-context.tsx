import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
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

  const value = useMemo<AuthContextValue>(() => {
    return {
      token: session?.token ?? null,
      user: session ? { userId: session.userId, email: session.email, name: session.name } : null,
      isAuthenticated: !!session,
      setSession: (data: AuthResponse) => {
        const next: StoredSession = {
          token: data.accessToken,
          userId: data.userId,
          email: data.email,
          name: data.name,
        }
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next))
        setSessionState(next)
      },
      logout: () => {
        localStorage.removeItem(AUTH_SESSION_KEY)
        setSessionState(null)
      },
    }
  }, [session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
