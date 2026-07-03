import { api } from '@/services/http/client'
import type { AdminUserSummary, NotificationLogEntry } from '@/types'

export function listUsers(token: string | null) {
  return api<AdminUserSummary[]>('GET', '/admin/users', undefined, { token })
}

export function deleteUser(userId: string, token: string | null) {
  return api<void>('DELETE', `/admin/users/${userId}`, undefined, { token })
}

export function listAllNotifications(token: string | null) {
  return api<NotificationLogEntry[]>('GET', '/admin/notifications', undefined, { token })
}
