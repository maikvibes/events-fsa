import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useRegisterDeviceToken } from '@/features/notifications/hooks'
import { ensurePushRegistered } from '@/features/push/use-push'

/**
 * When a user is authenticated (fresh login or reload with an existing session)
 * and has already granted notification permission, silently (re)register the FCM
 * token so they stay wired to the tray + OS delivery. If permission was never
 * asked ('default') or was denied, this does nothing — no nagging prompt.
 */
export function PushAutoEnable() {
  const { isAuthenticated, user } = useAuth()
  const registerToken = useRegisterDeviceToken()
  const doneForUser = useRef<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !user) return
    if (doneForUser.current === user.userId) return
    doneForUser.current = user.userId

    ensurePushRegistered(registerToken.mutateAsync, false).catch(() => {
      // Silent: auto-enable failures should never surface to the user.
    })
  }, [isAuthenticated, user, registerToken])

  return null
}
