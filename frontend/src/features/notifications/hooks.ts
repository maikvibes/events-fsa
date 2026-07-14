import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as notificationsApi from '@/features/notifications/api'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/services/http/client'

function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
}

export function useMyNotifications(options?: {
  refetchInterval?: number
  refetchOnWindowFocus?: boolean
}) {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['notifications', 'mine'],
    queryFn: () => notificationsApi.listMine(token),
    enabled: isAuthenticated,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  })
}

export function useSendNotification() {
  const { token } = useAuth()
  return useMutation({
    mutationFn: (payload: { userId: string; title: string; body: string }) =>
      notificationsApi.sendToUser(payload, token),
    onSuccess: () => toast.success('Notification sent'),
    onError: (e) => toast.error('Could not send notification', { description: errorMessage(e) }),
  })
}

export function useBroadcast() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { title: string; body: string; eventId?: string }) =>
      notificationsApi.broadcast(payload, token),
    onSuccess: () => {
      toast.success('Broadcast queued for delivery')
      qc.invalidateQueries({ queryKey: ['broadcast-runs'] })
    },
    onError: (e) => toast.error('Could not broadcast', { description: errorMessage(e) }),
  })
}

// Run-history list. Polls while any run is still in flight so the table reflects
// live progress without a manual refresh.
export function useBroadcastRuns() {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['broadcast-runs'],
    queryFn: () => notificationsApi.listBroadcastRuns(token),
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const runs = query.state.data
      const active = runs?.some((r) => r.status !== 'completed')
      return active ? 1500 : false
    },
  })
}

// One run with its per-instance breakdown. Polls until the run reaches a
// terminal state (completed or cancelled).
export function useBroadcastRun(broadcastId: string | null) {
  const { token } = useAuth()
  return useQuery({
    queryKey: ['broadcast-runs', broadcastId],
    queryFn: () => notificationsApi.getBroadcastRun(broadcastId as string, token),
    enabled: !!broadcastId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'completed' || status === 'cancelled' ? false : 1000
    },
  })
}

export function useCancelBroadcast() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (broadcastId: string) => notificationsApi.cancelBroadcastRun(broadcastId, token),
    onSuccess: () => {
      toast.success('Cancelling broadcast…')
      qc.invalidateQueries({ queryKey: ['broadcast-runs'] })
    },
    onError: (e) => toast.error('Could not cancel', { description: errorMessage(e) }),
  })
}

export function useRegisterDeviceToken() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { token: string; platform: 'web' }) => notificationsApi.registerToken(payload, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })
}
