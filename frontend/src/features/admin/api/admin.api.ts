import { api } from '@/services/http/client'

export interface AdminUser {
  userId: string
  email: string
  name: string
  createdAt: string
}

export interface AdminEvent {
  eventId: string
  userId: string
  title: string
  description: string
  date: string
  createdAt: string
  updatedAt: string
}

export interface AdminNotification {
  id: string
  userId: string
  eventId: string | null
  title: string
  body: string
  status: string
  error: string | null
  createdAt: string
}

export async function listUsers(token: string | null): Promise<AdminUser[]> {
  const data = await api('GET', '/admin/users', undefined, { token })
  return Array.isArray(data) ? (data as unknown as AdminUser[]) : []
}

export function deleteUser(userId: string, token: string | null) {
  return api('DELETE', `/admin/users/${userId}`, undefined, { token })
}

export async function listAllEvents(token: string | null): Promise<AdminEvent[]> {
  const data = await api('GET', '/events', undefined, { token })
  return Array.isArray(data) ? (data as unknown as AdminEvent[]) : []
}

export function deleteEvent(eventId: string, token: string | null) {
  return api('DELETE', `/events/${eventId}`, undefined, { token })
}

export async function listAllNotifications(token: string | null): Promise<AdminNotification[]> {
  const data = await api('GET', '/admin/notifications', undefined, { token })
  return Array.isArray(data) ? (data as unknown as AdminNotification[]) : []
}
