import { useEffect, useState } from 'react'
import * as authApi from '@/features/auth/api/auth.api'

const GUEST_ACCOUNT_KEY = 'guestAccount'

interface GuestCredentials {
  email: string
  password: string
}

function loadCredentials(): GuestCredentials | null {
  const raw = localStorage.getItem(GUEST_ACCOUNT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as GuestCredentials
  } catch {
    return null
  }
}

function createCredentials(): GuestCredentials {
  const credentials = { email: `guest-${crypto.randomUUID()}@guest.local`, password: crypto.randomUUID() }
  localStorage.setItem(GUEST_ACCOUNT_KEY, JSON.stringify(credentials))
  return credentials
}

export function useGuestSession() {
  const [token, setToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function register() {
      return authApi.register({ ...createCredentials(), name: 'Guest' })
    }

    async function establish() {
      const existing = loadCredentials()
      try {
        // A saved guest account may no longer exist server-side (e.g. a reset
        // database) — fall back to creating a fresh one instead of failing.
        const data = existing ? await authApi.login(existing).catch(register) : await register()
        if (cancelled) return
        setToken(data.accessToken as string)
        setUserId(data.userId as string)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }

    establish()
    return () => {
      cancelled = true
    }
  }, [])

  return { token, userId, ready: !!token, error }
}
