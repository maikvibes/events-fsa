import { api } from '@/services/http/client'
import type { EventItem } from '@/types'

export interface EventFormInput {
  title: string
  description: string
  date: string
}

export function listAll(token: string | null) {
  return api<EventItem[]>('GET', '/events', undefined, { token })
}

export function listMine(token: string | null) {
  return api<EventItem[]>('GET', '/events/me', undefined, { token })
}

export function getOne(eventId: string, token: string | null) {
  return api<EventItem>('GET', `/events/${eventId}`, undefined, { token })
}

export function create(payload: EventFormInput, token: string | null) {
  return api<EventItem>('POST', '/events', payload, { token })
}

export function update(eventId: string, payload: Partial<EventFormInput>, token: string | null) {
  return api<EventItem>('PUT', `/events/${eventId}`, payload, { token })
}

export function remove(eventId: string, token: string | null) {
  return api<void>('DELETE', `/events/${eventId}`, undefined, { token })
}

export function follow(eventId: string, token: string | null) {
  return api<void>('POST', `/events/${eventId}/follow`, undefined, { token })
}

export function unfollow(eventId: string, token: string | null) {
  return api<void>('DELETE', `/events/${eventId}/follow`, undefined, { token })
}

export function announce(eventId: string, payload: { title: string; body: string }, token: string | null) {
  return api<{ notified: number }>('POST', `/events/${eventId}/announce`, payload, { token })
}
