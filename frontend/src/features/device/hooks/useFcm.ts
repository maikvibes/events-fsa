import { useState } from 'react'
import { getToken } from 'firebase/messaging'
import { messaging } from '@/lib/firebase'
import * as deviceApi from '@/features/device/api/device.api'
import { type LogKind, type StatusState, esc } from '@/types'

interface UseFcmParams {
  userId: string | null
  token: string | null
  addLog: (kind: LogKind, label: string, detail?: string) => void
}

export function useFcm({ userId, token, addLog }: UseFcmParams) {
  const [deviceToken, setDeviceToken] = useState<string | null>(null)
  const [deviceStatus, setDeviceStatus] = useState<StatusState>({
    msg: 'Ready. Tap enable to register this device.',
    kind: 'info',
  })

  async function enable() {
    try {
      setDeviceStatus({ msg: 'Requesting notification permission…', kind: 'info' })
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setDeviceStatus({ msg: 'Permission denied. Allow notifications and retry.', kind: 'err' })
        return
      }
      setDeviceStatus({ msg: 'Registering service worker…', kind: 'info' })
      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
      setDeviceStatus({ msg: 'Fetching FCM token…', kind: 'info' })
      const fcmToken = await getToken(messaging, { serviceWorkerRegistration: swReg })
      if (!fcmToken) {
        setDeviceStatus({ msg: 'No token returned. Check the console.', kind: 'err' })
        return
      }
      setDeviceToken(fcmToken)
      setDeviceStatus({ msg: 'Registering token with backend…', kind: 'info' })
      await deviceApi.registerToken({ userId, token: fcmToken, platform: 'web' }, token)
      setDeviceStatus({ msg: 'Device registered! Pushes to your account will arrive in the tray.', kind: 'ok' })
      addLog('ok', 'register-token', `…${esc(fcmToken.slice(-8))}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setDeviceStatus({ msg: 'Error: ' + msg, kind: 'err' })
      addLog('err', 'register-token failed', esc(msg))
    }
  }

  return { deviceToken, deviceStatus, enable }
}
