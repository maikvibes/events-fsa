import { useMutation, useQuery } from '@tanstack/react-query'
import * as authApi from '@/features/auth/api'
import { useAuth } from '@/contexts/auth-context'

export function useLogin() {
  const { setSession } = useAuth()
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: setSession,
  })
}

export function useRegister() {
  const { setSession } = useAuth()
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: setSession,
  })
}

export function useProfile() {
  const { token, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.getProfile(token),
    enabled: isAuthenticated,
  })
}
