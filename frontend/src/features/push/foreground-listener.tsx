import { useEffect } from 'react'
import { onMessage } from 'firebase/messaging'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { getMessagingIfSupported } from '@/lib/firebase'

export function PushForegroundListener() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    getMessagingIfSupported().then((messaging) => {
      if (!messaging) return
      unsubscribe = onMessage(messaging, (payload) => {
        const n = payload.notification ?? {}
        toast(n.title ?? 'New notification', { description: n.body })
        // Refresh the header tray + history page so the new item appears live.
        queryClient.invalidateQueries({ queryKey: ['notifications', 'mine'] })
      })
    })
    return () => unsubscribe?.()
  }, [queryClient])

  return null
}
