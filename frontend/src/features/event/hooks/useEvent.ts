import { useState, useEffect, useCallback } from 'react'
import * as eventApi from '@/features/event/api/event.api'
import { type EventItem, type LogKind, esc } from '@/types'

function defaultEventDate() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setSeconds(0, 0)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface UseEventParams {
  token: string | null
  addLog: (kind: LogKind, label: string, detail?: string) => void
}

export function useEvent({ token, addLog }: UseEventParams) {
  const [eventTitle, setEventTitle] = useState('Team standup')
  const [eventDesc, setEventDesc] = useState('Daily sync at the usual spot.')
  const [eventDate, setEventDate] = useState(defaultEventDate)
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      setEvents(await eventApi.listMyEvents(token))
    } catch (e) {
      addLog('err', 'list-events failed', esc(e instanceof Error ? e.message : String(e)))
    } finally {
      setEventsLoading(false)
    }
  }, [token, addLog])

  useEffect(() => {
    if (token) loadEvents()
  }, [token, loadEvents])

  async function createEvent() {
    const title = eventTitle.trim()
    const description = eventDesc.trim()
    if (!title || !description || !eventDate) {
      addLog('err', 'event skipped', 'title, description and date are required')
      return
    }
    const date = new Date(eventDate)
    if (!(date > new Date())) {
      addLog('err', 'event skipped', 'date must be in the future')
      return
    }
    try {
      const data = await eventApi.createEvent({ title, description, date: date.toISOString() }, token)
      addLog('ok', 'create-event', data?.id ? `eventId ${esc(String(data.id))} — fan-out triggered` : 'created')
      await loadEvents()
    } catch (e) {
      addLog('err', 'create-event failed', esc(e instanceof Error ? e.message : String(e)))
    }
  }

  async function removeEvent(eventId: string) {
    try {
      await eventApi.deleteEvent(eventId, token)
      addLog('ok', 'delete-event', `eventId ${esc(eventId)}`)
      await loadEvents()
    } catch (e) {
      addLog('err', 'delete-event failed', esc(e instanceof Error ? e.message : String(e)))
    }
  }

  return {
    eventTitle,
    setEventTitle,
    eventDesc,
    setEventDesc,
    eventDate,
    setEventDate,
    createEvent,
    events,
    eventsLoading,
    loadEvents,
    removeEvent,
  }
}
