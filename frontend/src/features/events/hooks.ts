import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as eventsApi from '@/features/events/api'
import type { EventFormInput } from '@/features/events/api'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/services/http/client'

function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
}

export function useEvents() {
  const { token } = useAuth()
  return useQuery({
    queryKey: ['events', 'all'],
    queryFn: () => eventsApi.listAll(token),
  })
}

export function useMyEvents() {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['events', 'mine'],
    queryFn: () => eventsApi.listMine(token),
    enabled: isAuthenticated,
  })
}

export function useEvent(eventId: string | undefined) {
  const { token } = useAuth()
  return useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => eventsApi.getOne(eventId!, token),
    enabled: !!eventId,
  })
}

export function useCreateEvent() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: EventFormInput) => eventsApi.create(payload, token),
    onSuccess: () => {
      toast.success('Event created')
      qc.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (e) => toast.error('Could not create event', { description: errorMessage(e) }),
  })
}

export function useUpdateEvent() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, payload }: { eventId: string; payload: Partial<EventFormInput> }) =>
      eventsApi.update(eventId, payload, token),
    onSuccess: () => {
      toast.success('Event updated')
      qc.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (e) => toast.error('Could not update event', { description: errorMessage(e) }),
  })
}

export function useDeleteEvent() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: string) => eventsApi.remove(eventId, token),
    onSuccess: () => {
      toast.success('Event deleted')
      qc.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (e) => toast.error('Could not delete event', { description: errorMessage(e) }),
  })
}

export function useFollowEvent() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: string) => eventsApi.follow(eventId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
    onError: (e) => toast.error('Could not follow event', { description: errorMessage(e) }),
  })
}

export function useUnfollowEvent() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: string) => eventsApi.unfollow(eventId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
    onError: (e) => toast.error('Could not unfollow event', { description: errorMessage(e) }),
  })
}

export function useAnnounceEvent() {
  const { token } = useAuth()
  return useMutation({
    mutationFn: ({ eventId, payload }: { eventId: string; payload: { title: string; body: string } }) =>
      eventsApi.announce(eventId, payload, token),
    onSuccess: (data) => toast.success(`Announcement sent to ${data.notified} follower${data.notified === 1 ? '' : 's'}`),
    onError: (e) => toast.error('Could not send announcement', { description: errorMessage(e) }),
  })
}
