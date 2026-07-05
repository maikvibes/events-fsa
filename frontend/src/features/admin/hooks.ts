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

export function useAdminNotifications() {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: () => adminApi.listAllNotifications(token),
    enabled: isAuthenticated,
  })
}
