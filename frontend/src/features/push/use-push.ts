import { useState } from 'react'
import { getToken } from 'firebase/messaging'
import { toast } from 'sonner'
import { getMessagingIfSupported } from '@/lib/firebase'
import * as notificationsApi from '@/features/notifications/api'
import { useRegisterDeviceToken } from '@/features/notifications/hooks'

export type PushStatus = 'idle' | 'requesting' | 'registering' | 'enabled' | 'unsupported' | 'denied' | 'error'

/**
 * Fetches the FCM token and registers it with the backend. Returns the outcome
 * as a PushStatus. Shared by the manual enable button and the auto-enable flow.
 * `requestPermission` controls whether we prompt when permission is still
 * 'default' (manual button = true, silent auto-enable = false).
 */
export async function ensurePushRegistered(
  register: (payload: { token: string; platform: 'web' }) => Promise<unknown>,
  requestPermission: boolean,
): Promise<PushStatus> {
  const messaging = await getMessagingIfSupported()
  if (!messaging) return 'unsupported'

  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') {
    if (!requestPermission) return 'idle'
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
  }

  const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  const fcmToken = await getToken(messaging, { serviceWorkerRegistration: swReg })
  if (!fcmToken) return 'error'

  await register({ token: fcmToken, platform: 'web' })
  return 'enabled'
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus>('idle')
  const registerToken = useRegisterDeviceToken()

  async function enable() {
    setStatus('requesting')
    try {
      const result = await ensurePushRegistered(registerToken.mutateAsync, true)
      setStatus(result)
      if (result === 'enabled') toast.success('Push notifications enabled')
    } catch (e) {
      setStatus('error')
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Could not enable push notifications', { description: msg })
    }
  }

  return { status, enable }
}

// Registration helper usable outside React (e.g. the auto-enable effect).
export function registerTokenDirect(authToken: string | null) {
  return (payload: { token: string; platform: 'web' }) =>
    notificationsApi.registerToken(payload, authToken)
}
