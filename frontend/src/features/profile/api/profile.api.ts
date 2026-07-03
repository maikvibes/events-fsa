import { api } from '@/services/http/client'

export function getProfile(token: string | null) {
  return api('GET', '/auth/profile', undefined, { token })
}
