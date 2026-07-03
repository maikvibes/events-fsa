import { type EventItem } from '@/types'

interface Props {
  isLoggedIn: boolean
  eventTitle: string
  setEventTitle: (v: string) => void
  eventDesc: string
  setEventDesc: (v: string) => void
  eventDate: string
  setEventDate: (v: string) => void
  onCreateEvent: () => void
  events: EventItem[]
  eventsLoading: boolean
  onRefreshEvents: () => void
  onDeleteEvent: (eventId: string) => void
}

export default function EventSection({
  isLoggedIn,
  eventTitle,
  setEventTitle,
  eventDesc,
  setEventDesc,
  eventDate,
  setEventDate,
  onCreateEvent,
  events,
  eventsLoading,
  onRefreshEvents,
  onDeleteEvent,
}: Props) {
  return (
    <section data-locked={!isLoggedIn ? '' : undefined}>
      <h2>Create an event (full fan-out)</h2>
      <p className="muted">
        Creates an event for your account, triggering the Kafka fan-out that
        pushes to <em>all</em> your registered devices.
      </p>
      <label htmlFor="event-title">Title</label>
      <input
        id="event-title"
        maxLength={200}
        value={eventTitle}
        onChange={e => setEventTitle(e.target.value)}
      />
      <label htmlFor="event-description">Description</label>
      <textarea
        id="event-description"
        maxLength={2000}
        value={eventDesc}
        onChange={e => setEventDesc(e.target.value)}
      />
      <label htmlFor="event-date">Date &amp; time (must be in the future)</label>
      <input
        id="event-date"
        type="datetime-local"
        value={eventDate}
        onChange={e => setEventDate(e.target.value)}
      />
      <button type="button" className="primary" disabled={!isLoggedIn} onClick={onCreateEvent}>
        Create event
      </button>

      <div className="event-list-header">
        <h3>Your events</h3>
        <button type="button" disabled={!isLoggedIn || eventsLoading} onClick={onRefreshEvents}>
          {eventsLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {events.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <ul className="event-list">
          {events.map(event => (
            <li key={event.eventId} className="event-list-item">
              <div>
                <div className="event-list-title">{event.title}</div>
                <div className="muted">{new Date(event.date).toLocaleString()}</div>
              </div>
              <button type="button" disabled={!isLoggedIn} onClick={() => onDeleteEvent(event.eventId)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
