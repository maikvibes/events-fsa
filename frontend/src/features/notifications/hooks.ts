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
  return useMutation({
    mutationFn: (payload: { title: string; body: string; eventId?: string }) =>
      notificationsApi.broadcast(payload, token),
    onSuccess: (data) => toast.success(`Broadcast queued for ${data.sent} device${data.sent === 1 ? '' : 's'}`),
    onError: (e) => toast.error('Could not broadcast', { description: errorMessage(e) }),
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
