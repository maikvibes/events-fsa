import { api } from '@/services/http/client'

export function registerToken(
  payload: { userId: string | null; token: string; platform: string },
  authToken: string | null,
) {
  return api('POST', '/notifications/register-token', payload, { token: authToken })
}
