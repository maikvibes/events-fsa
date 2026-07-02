import { api } from '@/services/http/client'
import { type EventItem } from '@/types'

export function createEvent(
  payload: { title: string; description: string; date: string },
  token: string | null,
) {
  return api('POST', '/events', payload, { token })
}

export async function listMyEvents(token: string | null): Promise<EventItem[]> {
  const data = await api('GET', '/events/me', undefined, { token })
  return Array.isArray(data) ? (data as unknown as EventItem[]) : []
}

export function deleteEvent(eventId: string, token: string | null) {
  return api('DELETE', `/events/${eventId}`, undefined, { token })
}
