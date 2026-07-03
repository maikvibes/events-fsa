import { useState } from 'react'
import { getToken } from 'firebase/messaging'
import { toast } from 'sonner'
import { getMessagingIfSupported } from '@/lib/firebase'
import { useRegisterDeviceToken } from '@/features/notifications/hooks'

export type PushStatus = 'idle' | 'requesting' | 'registering' | 'enabled' | 'unsupported' | 'denied' | 'error'

export function usePush() {
  const [status, setStatus] = useState<PushStatus>('idle')
  const registerToken = useRegisterDeviceToken()

  async function enable() {
    const messaging = await getMessagingIfSupported()
    if (!messaging) {
      setStatus('unsupported')
      return
    }
    setStatus('requesting')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setStatus('denied')
      return
    }
    try {
      setStatus('registering')
      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
      const fcmToken = await getToken(messaging, { serviceWorkerRegistration: swReg })
      if (!fcmToken) {
        setStatus('error')
        return
      }
      await registerToken.mutateAsync({ token: fcmToken, platform: 'web' })
      setStatus('enabled')
      toast.success('Push notifications enabled')
    } catch (e) {
      setStatus('error')
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Could not enable push notifications', { description: msg })
    }
  }

  return { status, enable }
}
