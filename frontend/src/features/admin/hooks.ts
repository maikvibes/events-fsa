import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as adminApi from '@/features/admin/api'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/services/http/client'
import type { Role } from '@/types'

function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
}

export function useAdminUsers(params: adminApi.ListUsersParams) {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => adminApi.listUsers(token, params),
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  })
}

export function useDeleteAdminUser() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId, token),
    onSuccess: () => {
      toast.success('User deleted')
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e) => toast.error('Could not delete user', { description: errorMessage(e) }),
  })
}

export function useUpdateUserRole() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      adminApi.updateUserRole(userId, role, token),
    onSuccess: () => {
      toast.success('Role updated')
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e) => toast.error('Could not update role', { description: errorMessage(e) }),
  })
}

export function useAdminNotifications(params: adminApi.ListNotificationsParams) {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['admin', 'notifications', params],
    queryFn: () => adminApi.listAllNotifications(token, params),
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  })
}

// Seed jobs: start a background seed, then poll its progress until both parts
// (users + tokens) reach a terminal state.
export function useStartSeed() {
  const { token } = useAuth()
  return useMutation({
    mutationFn: ({ count, fresh }: { count: number; fresh: boolean }) =>
      adminApi.startSeed(count, fresh, token),
    onError: (e) => toast.error('Could not start seed', { description: errorMessage(e) }),
  })
}

export function useSeedProgress(jobId: string | null) {
  const { token } = useAuth()
  return useQuery({
    queryKey: ['admin', 'seed', jobId],
    queryFn: () => adminApi.getSeedProgress(jobId as string, token),
    enabled: !!jobId,
    refetchInterval: (query) => (query.state.data?.finished ? false : 750),
  })
}
