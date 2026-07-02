import { useState, useEffect } from 'react'
import * as sendApi from '@/features/send/api/send.api'
import { type LogKind, esc } from '@/types'

interface UseSendParams {
  userId: string | null
  token: string | null
  deviceToken: string | null
  addLog: (kind: LogKind, label: string, detail?: string) => void
}

export function useSend({ userId, token, deviceToken, addLog }: UseSendParams) {
  const [sendUserId, setSendUserId] = useState('')
  const [sendDeviceToken, setSendDeviceToken] = useState('')
  const [sendTitle, setSendTitle] = useState('Hello from the console')
  const [sendBody, setSendBody] = useState('This push was fired straight from the notification console.')

  useEffect(() => {
    if (deviceToken) setSendDeviceToken(deviceToken)
  }, [deviceToken])

  useEffect(() => {
    if (!token) setSendDeviceToken('')
  }, [token])

  async function send() {
    const uid = sendUserId.trim() || userId
    const tok = sendDeviceToken.trim() || deviceToken
    const title = sendTitle.trim()
    const body = sendBody.trim()
    if (!tok) {
      addLog('err', 'send skipped', 'no device token — register this device first or paste one')
      return
    }
    if (!title || !body) {
      addLog('err', 'send skipped', 'title and body are required')
      return
    }
    try {
      const data = await sendApi.sendNotification({ userId: uid, deviceToken: tok, title, body }, token)
      if (data && data.success === false) {
        addLog('err', 'send → FCM failed', esc(String(data.error ?? '')))
      } else {
        addLog('ok', 'send', data?.messageId ? `messageId ${esc(String(data.messageId))}` : 'sent')
      }
    } catch (e) {
      addLog('err', 'send failed', esc(e instanceof Error ? e.message : String(e)))
    }
  }

  return {
    sendUserId,
    setSendUserId,
    sendDeviceToken,
    setSendDeviceToken,
    sendTitle,
    setSendTitle,
    sendBody,
    setSendBody,
    send,
  }
}
