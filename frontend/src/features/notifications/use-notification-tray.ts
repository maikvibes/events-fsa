import { useCallback, useState } from 'react'
import { useMyNotifications } from '@/features/notifications/hooks'
import { useAuth } from '@/contexts/auth-context'
import type { NotificationLogEntry } from '@/types'

const LAST_READ_PREFIX = 'notif:lastReadAt:'

function readLastReadAt(userId: string | undefined): number {
  if (!userId) return 0
  const raw = localStorage.getItem(LAST_READ_PREFIX + userId)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

/**
 * Drives the header notification tray. Wraps the shared notifications query with
 * polling + focus refetch, and layers client-side (per-device) read tracking on
 * top via localStorage. No backend read/unread state is required.
 */
export function useNotificationTray() {
  const { user } = useAuth()
  const userId = user?.userId
  const query = useMyNotifications({ refetchInterval: 45_000, refetchOnWindowFocus: true })

  const [lastReadAt, setLastReadAt] = useState<number>(() => readLastReadAt(userId))

  const items: NotificationLogEntry[] = query.data ?? []
  const unreadCount = items.reduce(
    (count, n) => (new Date(n.createdAt).getTime() > lastReadAt ? count + 1 : count),
    0,
  )

  const markAllRead = useCallback(() => {
    if (!userId) return
    const now = Date.now()
    localStorage.setItem(LAST_READ_PREFIX + userId, String(now))
    setLastReadAt(now)
  }, [userId])

  return { items, unreadCount, markAllRead, isLoading: query.isLoading }
}
