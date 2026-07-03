import { useState } from 'react'
import * as authApi from '@/features/auth/api/auth.api'
import { type LogKind, type StatusState, esc } from '@/types'

const AUTH_SESSION_KEY = 'authSession'

interface StoredSession {
  token: string
  userId: string
  email: string
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

export function useAuth(addLog: (kind: LogKind, label: string, detail?: string) => void) {
  const stored = loadStoredSession()
  const [token, setToken] = useState<string | null>(stored?.token ?? null)
  const [userId, setUserId] = useState<string | null>(stored?.userId ?? null)
  const [email, setEmail] = useState<string | null>(stored?.email ?? null)

  const [authStatus, setAuthStatus] = useState<StatusState>(
    stored
      ? { msg: `Restored session for ${stored.email}.`, kind: 'ok' }
      : { msg: 'Register a new account or log in to begin.', kind: 'info' },
  )

  const [name, setName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [password, setPassword] = useState('')

  function adoptSession(data: Record<string, unknown>, fallbackEmail: string) {
    const t = data.accessToken as string
    const uid = data.userId as string
    const em = (data.email as string | undefined) ?? fallbackEmail
    if (!t || !uid) throw new Error('auth response missing accessToken/userId')
    setToken(t)
    setUserId(uid)
    setEmail(em)
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ token: t, userId: uid, email: em }))
    return { token: t, userId: uid, email: em }
  }

  async function register() {
    if (!authEmail || !password || !name) {
      setAuthStatus({ msg: 'Name, email and password are required to register.', kind: 'err' })
      return
    }
    try {
      setAuthStatus({ msg: 'Registering…', kind: 'info' })
      const data = await authApi.register({ email: authEmail, password, name })
      adoptSession(data, authEmail)
      setAuthStatus({ msg: `Registered and logged in as ${authEmail}.`, kind: 'ok' })
      addLog('ok', 'register', `userId ${esc(String(data.userId))}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setAuthStatus({ msg: 'Register failed: ' + msg, kind: 'err' })
      addLog('err', 'register failed', esc(msg))
    }
  }

  async function login() {
    if (!authEmail || !password) {
      setAuthStatus({ msg: 'Email and password are required.', kind: 'err' })
      return
    }
    try {
      setAuthStatus({ msg: 'Logging in…', kind: 'info' })
      const data = await authApi.login({ email: authEmail, password })
      adoptSession(data, authEmail)
      setAuthStatus({ msg: `Logged in as ${authEmail}.`, kind: 'ok' })
      addLog('ok', 'login', `userId ${esc(String(data.userId))}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setAuthStatus({ msg: 'Login failed: ' + msg, kind: 'err' })
      addLog('err', 'login failed', esc(msg))
    }
  }

  function logout() {
    setToken(null)
    setUserId(null)
    setEmail(null)
    localStorage.removeItem(AUTH_SESSION_KEY)
    setAuthStatus({ msg: 'Logged out.', kind: 'info' })
    addLog('ok', 'logout')
  }

  return {
    token,
    userId,
    email,
    authStatus,
    name,
    setName,
    authEmail,
    setAuthEmail,
    password,
    setPassword,
    register,
    login,
    logout,
  }
}
