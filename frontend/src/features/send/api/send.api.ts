import { api } from '@/services/http/client'

export function sendToUser(
  payload: { userId: string; title: string; body: string },
  token: string | null,
) {
  return api('POST', '/notifications/send', payload, { token })
}

export function broadcast(
  payload: { title: string; body: string; eventId?: string },
  token: string | null,
) {
  return api('POST', '/notifications/broadcast', payload, { token })
}
