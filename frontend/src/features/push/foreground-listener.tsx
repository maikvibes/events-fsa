import { useEffect } from 'react'
import { onMessage } from 'firebase/messaging'
import { toast } from 'sonner'
import { getMessagingIfSupported } from '@/lib/firebase'

export function PushForegroundListener() {
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    getMessagingIfSupported().then((messaging) => {
      if (!messaging) return
      unsubscribe = onMessage(messaging, (payload) => {
        const n = payload.notification ?? {}
        toast(n.title ?? 'New notification', { description: n.body })
      })
    })
    return () => unsubscribe?.()
  }, [])

  return null
}
