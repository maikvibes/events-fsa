import { type SendMode } from '@/features/send/hooks/useSend'
import { type EventItem } from '@/types'

interface Props {
  isLoggedIn: boolean
  sendMode: SendMode
  setSendMode: (v: SendMode) => void
  sendUserId: string
  setSendUserId: (v: string) => void
  sendEventId: string
  setSendEventId: (v: string) => void
  events: EventItem[]
  sendTitle: string
  setSendTitle: (v: string) => void
  sendBody: string
  setSendBody: (v: string) => void
  onSend: () => void
}

export default function SendSection({
  isLoggedIn,
  sendMode,
  setSendMode,
  sendUserId,
  setSendUserId,
  sendEventId,
  setSendEventId,
  events,
  sendTitle,
  setSendTitle,
  sendBody,
  setSendBody,
  onSend,
}: Props) {
  return (
    <section data-locked={!isLoggedIn ? '' : undefined}>
      <h2>Send a notification</h2>
      <div className="tab-bar" role="radiogroup" aria-label="Send mode">
        <button
          type="button"
          className={`tab-btn${sendMode === 'user' ? ' active' : ''}`}
          aria-pressed={sendMode === 'user'}
          onClick={() => setSendMode('user')}
        >
          To one user
        </button>
        <button
          type="button"
          className={`tab-btn${sendMode === 'broadcast' ? ' active' : ''}`}
          aria-pressed={sendMode === 'broadcast'}
          onClick={() => setSendMode('broadcast')}
        >
          To everyone (broadcast)
        </button>
      </div>

      {sendMode === 'user' ? (
        <>
          <label htmlFor="send-userid">
            Target user ID <span className="muted">(defaults to you)</span>
          </label>
          <input
            id="send-userid"
            placeholder="defaults to logged-in user"
            value={sendUserId}
            onChange={e => setSendUserId(e.target.value)}
          />
        </>
      ) : (
        <>
          <p className="muted">
            Sends to every device registered on the server (admin only). No target user needed.
          </p>
          <label htmlFor="send-event">
            Event <span className="muted">(optional — links this broadcast to an event)</span>
          </label>
          <select
            id="send-event"
            value={sendEventId}
            onChange={e => setSendEventId(e.target.value)}
          >
            <option value="">No event — general broadcast</option>
            {events.map(ev => (
              <option key={ev.eventId} value={ev.eventId}>{ev.title}</option>
            ))}
          </select>
        </>
      )}

      <label htmlFor="send-title">Title</label>
      <input
        id="send-title"
        maxLength={100}
        value={sendTitle}
        onChange={e => setSendTitle(e.target.value)}
      />
      <label htmlFor="send-body">Body</label>
      <textarea
        id="send-body"
        maxLength={500}
        value={sendBody}
        onChange={e => setSendBody(e.target.value)}
      />
      <button type="button" className="primary" disabled={!isLoggedIn} onClick={onSend}>
        {sendMode === 'broadcast' ? 'Broadcast to everyone' : 'Send notification'}
      </button>
    </section>
  )
}
