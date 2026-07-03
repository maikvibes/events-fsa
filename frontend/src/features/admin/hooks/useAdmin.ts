import { useRef, useState } from 'react'
import * as adminApi from '@/features/admin/api/admin.api'
import { type AdminUser, type AdminEvent, type AdminNotification } from '@/features/admin/api/admin.api'
import { type LogKind, type StatusState, esc } from '@/types'

interface UseAdminParams {
  token: string | null
  isLoggedIn: boolean
  addLog: (kind: LogKind, label: string, detail?: string) => void
}

export function useAdmin({ token, isLoggedIn, addLog }: UseAdminParams) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersStatus, setUsersStatus] = useState<StatusState>({ msg: 'Not loaded yet.', kind: 'info' })
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [eventsStatus, setEventsStatus] = useState<StatusState>({ msg: 'Not loaded yet.', kind: 'info' })
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [notificationsStatus, setNotificationsStatus] = useState<StatusState>({ msg: 'Not loaded yet.', kind: 'info' })
  const [loading, setLoading] = useState(false)
  const hasLoadedRef = useRef(false)

  async function loadUsers() {
    setUsersStatus({ msg: 'Loading users…', kind: 'info' })
    try {
      setUsers(await adminApi.listUsers(token))
      setUsersStatus({ msg: 'Users loaded.', kind: 'ok' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setUsersStatus({ msg: 'Failed to load users: ' + msg, kind: 'err' })
      addLog('err', 'list-users failed', esc(msg))
    }
  }

  async function loadEvents() {
    setEventsStatus({ msg: 'Loading events…', kind: 'info' })
    try {
      setEvents(await adminApi.listAllEvents(token))
      setEventsStatus({ msg: 'Events loaded.', kind: 'ok' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setEventsStatus({ msg: 'Failed to load events: ' + msg, kind: 'err' })
      addLog('err', 'list-all-events failed', esc(msg))
    }
  }

  async function loadNotifications() {
    setNotificationsStatus({ msg: 'Loading notifications…', kind: 'info' })
    try {
      setNotifications(await adminApi.listAllNotifications(token))
      setNotificationsStatus({ msg: 'Notifications loaded.', kind: 'ok' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setNotificationsStatus({ msg: 'Failed to load notifications: ' + msg, kind: 'err' })
      addLog('err', 'list-all-notifications failed', esc(msg))
    }
  }

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadUsers(), loadEvents(), loadNotifications()])
    setLoading(false)
  }

  function onTabOpen() {
    if (hasLoadedRef.current || !isLoggedIn) return
    hasLoadedRef.current = true
    loadAll()
  }

  async function removeUser(userId: string) {
    try {
      await adminApi.deleteUser(userId, token)
      addLog('ok', 'delete-user', `userId ${esc(userId)}`)
      await loadUsers()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      addLog('err', 'delete-user failed', esc(msg))
    }
  }

  async function removeEvent(eventId: string) {
    try {
      await adminApi.deleteEvent(eventId, token)
      addLog('ok', 'delete-event', `eventId ${esc(eventId)}`)
      await loadEvents()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      addLog('err', 'delete-event failed', esc(msg))
    }
  }

  return {
    users,
    usersStatus,
    events,
    eventsStatus,
    notifications,
    notificationsStatus,
    loading,
    onTabOpen,
    refresh: loadAll,
    removeUser,
    removeEvent,
  }
}
