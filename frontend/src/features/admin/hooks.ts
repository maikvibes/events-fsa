import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as adminApi from '@/features/admin/api'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/services/http/client'

function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
}

export function useAdminUsers() {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.listUsers(token),
    enabled: isAuthenticated,
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

export function useAdminNotifications() {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: () => adminApi.listAllNotifications(token),
    enabled: isAuthenticated,
  })
}
