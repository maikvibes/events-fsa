import { api } from '@/services/http/client'
import type { AuthResponse, AuthUser } from '@/types'

export function register(payload: { email: string; password: string; name: string }) {
  return api<AuthResponse>('POST', '/auth/register', payload, { auth: false })
}

export function login(payload: { email: string; password: string }) {
  return api<AuthResponse>('POST', '/auth/login', payload, { auth: false })
}

export function getProfile(token: string | null) {
  return api<AuthUser>('GET', '/auth/profile', undefined, { token })
}
