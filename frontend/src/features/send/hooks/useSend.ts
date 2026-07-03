import { useState } from 'react'
import * as sendApi from '@/features/send/api/send.api'
import { ApiError } from '@/services/http/client'
import { type LogKind, esc } from '@/types'

export type SendMode = 'user' | 'broadcast'

interface UseSendParams {
  userId: string | null
  token: string | null
  addLog: (kind: LogKind, label: string, detail?: string) => void
}

export function useSend({ userId, token, addLog }: UseSendParams) {
  const [sendMode, setSendMode] = useState<SendMode>('user')
  const [sendUserId, setSendUserId] = useState('')
  const [sendEventId, setSendEventId] = useState('')
  const [sendTitle, setSendTitle] = useState('Hello from the console')
  const [sendBody, setSendBody] = useState('This push was fired straight from the notification console.')

  async function send() {
    const title = sendTitle.trim()
    const body = sendBody.trim()
    if (!title || !body) {
      addLog('err', 'send skipped', 'title and body are required')
      return
    }

    if (sendMode === 'broadcast') {
      try {
        const eventId = sendEventId || undefined
        const data = await sendApi.broadcast({ title, body, eventId }, token)
        addLog('ok', 'broadcast', data?.message ? esc(String(data.message)) : 'queued for delivery')
      } catch (e) {
        const msg = e instanceof ApiError && e.statusCode === 403
          ? 'Admin only — you are not on the ADMIN_EMAILS allowlist.'
          : e instanceof Error ? e.message : String(e)
        addLog('err', 'broadcast failed', esc(msg))
      }
      return
    }

    const uid = sendUserId.trim() || userId
    if (!uid) {
      addLog('err', 'send skipped', 'no target user ID — enter one or sign in')
      return
    }
    try {
      const data = await sendApi.sendToUser({ userId: uid, title, body }, token)
      addLog('ok', 'send', `sent ${esc(String(data?.sent ?? ''))} / failed ${esc(String(data?.failed ?? ''))}`)
    } catch (e) {
      const msg = e instanceof ApiError && e.statusCode === 403
        ? 'Admin only — you are not on the ADMIN_EMAILS allowlist.'
        : e instanceof Error ? e.message : String(e)
      addLog('err', 'send failed', esc(msg))
    }
  }

  return {
    sendMode,
    setSendMode,
    sendUserId,
    setSendUserId,
    sendEventId,
    setSendEventId,
    sendTitle,
    setSendTitle,
    sendBody,
    setSendBody,
    send,
  }
}
