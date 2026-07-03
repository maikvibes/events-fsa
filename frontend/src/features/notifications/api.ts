import { api } from '@/services/http/client'
import type { NotificationLogEntry } from '@/types'

export function listMine(token: string | null) {
  return api<NotificationLogEntry[]>('GET', '/notifications/me', undefined, { token })
}

export function sendToUser(payload: { userId: string; title: string; body: string }, token: string | null) {
  return api<void>('POST', '/notifications/send', payload, { token })
}

export function broadcast(payload: { title: string; body: string; eventId?: string }, token: string | null) {
  return api<{ sent: number; failed: number }>('POST', '/notifications/broadcast', payload, { token })
}

export function registerToken(payload: { token: string; platform: 'web' }, authToken: string | null) {
  return api<void>('POST', '/notifications/register-token', payload, { token: authToken })
}
