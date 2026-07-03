import { api } from '@/services/http/client'

export function register(payload: { email: string; password: string; name: string }) {
  return api('POST', '/auth/register', payload, { auth: false })
}

export function login(payload: { email: string; password: string }) {
  return api('POST', '/auth/login', payload, { auth: false })
}
