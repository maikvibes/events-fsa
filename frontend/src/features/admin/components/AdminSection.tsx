import { type StatusState } from '@/types'
import { type AdminUser, type AdminEvent, type AdminNotification } from '@/features/admin/api/admin.api'

interface Props {
  isLoggedIn: boolean
  users: AdminUser[]
  usersStatus: StatusState
  events: AdminEvent[]
  eventsStatus: StatusState
  notifications: AdminNotification[]
  notificationsStatus: StatusState
  loading: boolean
  onRefresh: () => void
  onDeleteUser: (userId: string) => void
  onDeleteEvent: (eventId: string) => void
}

export default function AdminSection({
  isLoggedIn,
  users,
  usersStatus,
  events,
  eventsStatus,
  notifications,
  notificationsStatus,
  loading,
  onRefresh,
  onDeleteUser,
  onDeleteEvent,
}: Props) {
  return (
    <section data-locked={!isLoggedIn ? '' : undefined}>
      <h2>Admin panel</h2>
      <p className="muted">
        Requires an ADMIN_EMAILS account. Non-admin accounts will see "Admin
        only" errors below instead of data.
      </p>
      <button type="button" className="primary" disabled={!isLoggedIn || loading} onClick={onRefresh}>
        {loading ? 'Loading…' : 'Refresh all'}
      </button>

      <div className="event-list-header">
        <h3>Users ({users.length})</h3>
      </div>
      <div className={`status ${usersStatus.kind}`}>
        <span className="status-dot" />
        {usersStatus.msg}
      </div>
      {users.length === 0 ? (
        <p className="muted">No users loaded.</p>
      ) : (
        <ul className="event-list">
          {users.map(u => (
            <li key={u.userId} className="event-list-item">
              <div>
                <div className="event-list-title">{u.email}</div>
                <div className="muted">{u.name} — joined {new Date(u.createdAt).toLocaleString()}</div>
              </div>
              <button
                type="button"
                disabled={!isLoggedIn}
                onClick={() => {
                  if (window.confirm(`Delete user ${u.email}? This cannot be undone.`)) onDeleteUser(u.userId)
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="event-list-header">
        <h3>Events ({events.length})</h3>
      </div>
      <div className={`status ${eventsStatus.kind}`}>
        <span className="status-dot" />
        {eventsStatus.msg}
      </div>
      {events.length === 0 ? (
        <p className="muted">No events loaded.</p>
      ) : (
        <ul className="event-list">
          {events.map(ev => (
            <li key={ev.eventId} className="event-list-item">
              <div>
                <div className="event-list-title">{ev.title}</div>
                <div className="muted">{new Date(ev.date).toLocaleString()}</div>
              </div>
              <button
                type="button"
                disabled={!isLoggedIn}
                onClick={() => {
                  if (window.confirm(`Delete event "${ev.title}"? This cannot be undone.`)) onDeleteEvent(ev.eventId)
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="event-list-header">
        <h3>Notifications ({notifications.length})</h3>
      </div>
      <div className={`status ${notificationsStatus.kind}`}>
        <span className="status-dot" />
        {notificationsStatus.msg}
      </div>
      {notifications.length === 0 ? (
        <p className="muted">No notifications loaded.</p>
      ) : (
        <ul className="event-list">
          {notifications.map(n => (
            <li key={n.id} className="event-list-item">
              <div>
                <div className="event-list-title">{n.title} — {n.status}</div>
                <div className="muted">{n.body}</div>
                <div className="muted">userId {n.userId} — {new Date(n.createdAt).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
