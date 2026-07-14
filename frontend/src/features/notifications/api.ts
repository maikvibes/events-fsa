import { api } from '@/services/http/client'
import type { NotificationLogEntry, BroadcastRunSummary, BroadcastRunDetail } from '@/types'

export function listMine(token: string | null) {
  return api<NotificationLogEntry[]>('GET', '/notifications/me', undefined, { token })
}

export function sendToUser(payload: { userId: string; title: string; body: string }, token: string | null) {
  return api<void>('POST', '/notifications/send', payload, { token })
}

export function broadcast(payload: { title: string; body: string; eventId?: string }, token: string | null) {
  return api<{ accepted: boolean; broadcastId: string; message: string }>(
    'POST',
    '/notifications/broadcast',
    payload,
    { token },
  )
}

export function listBroadcastRuns(token: string | null, limit = 25) {
  return api<BroadcastRunSummary[]>('GET', `/notifications/broadcast-runs?limit=${limit}`, undefined, { token })
}

export function getBroadcastRun(broadcastId: string, token: string | null) {
  return api<BroadcastRunDetail | null>('GET', `/notifications/broadcast-runs/${broadcastId}`, undefined, { token })
}

export function registerToken(payload: { token: string; platform: 'web' }, authToken: string | null) {
  return api<void>('POST', '/notifications/register-token', payload, { token: authToken })
}
