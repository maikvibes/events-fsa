import { api } from '@/services/http/client'

export function sendNotification(
  payload: { userId: string | null; deviceToken: string; title: string; body: string },
  token: string | null,
) {
  return api('POST', '/notifications/send', payload, { token })
}
