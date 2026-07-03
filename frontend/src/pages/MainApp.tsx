import { useState } from 'react'
import { type RefObject } from 'react'
import { type StatusState, type LogEntry, type EventItem } from '@/types'
import { type HealthState } from '@/features/health/hooks/useHealth'
import DeviceSection from '@/features/device/components/DeviceSection'
import EventSection from '@/features/event/components/EventSection'
import SendSection from '@/features/send/components/SendSection'
import { type SendMode } from '@/features/send/hooks/useSend'
import ProfileSection from '@/features/profile/components/ProfileSection'
import { type ProfileData } from '@/features/profile/hooks/useProfile'
import AdminSection from '@/features/admin/components/AdminSection'
import { type AdminUser, type AdminEvent, type AdminNotification } from '@/features/admin/api/admin.api'
import ResultLog from '@/components/common/ResultLog'
import HealthBadge from '@/components/common/HealthBadge'

type Tab = 'device' | 'event' | 'send' | 'profile' | 'admin'

interface Props {
  // auth
  isLoggedIn: boolean
  canUseGuestServices: boolean
  email: string | null
  onLogout: () => void
  onSignIn: () => void
  health: HealthState
  // fcm
  deviceToken: string | null
  deviceStatus: StatusState
  onEnable: () => void
  // event
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
  // send
  sendMode: SendMode
  setSendMode: (v: SendMode) => void
  sendUserId: string
  setSendUserId: (v: string) => void
  sendEventId: string
  setSendEventId: (v: string) => void
  sendTitle: string
  setSendTitle: (v: string) => void
  sendBody: string
  setSendBody: (v: string) => void
  onSend: () => void
  // log
  logEntries: LogEntry[]
  logRef: RefObject<HTMLPreElement | null>
  onClearLog: () => void
  // profile
  profile: ProfileData | null
  profileStatus: StatusState
  profileLoading: boolean
  onRefreshProfile: () => void
  onProfileTabOpen: () => void
  // admin
  adminUsers: AdminUser[]
  adminUsersStatus: StatusState
  adminEvents: AdminEvent[]
  adminEventsStatus: StatusState
  adminNotifications: AdminNotification[]
  adminNotificationsStatus: StatusState
  adminLoading: boolean
  onAdminTabOpen: () => void
  onAdminRefresh: () => void
  onDeleteAdminUser: (userId: string) => void
  onDeleteAdminEvent: (eventId: string) => void
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'device', label: 'Register Device' },
  { id: 'event', label: 'Create Event' },
  { id: 'send', label: 'Send Notification' },
  { id: 'profile', label: 'Profile' },
  { id: 'admin', label: 'Admin' },
]

export default function MainApp({
  isLoggedIn,
  canUseGuestServices,
  email,
  onLogout,
  onSignIn,
  health,
  deviceToken,
  deviceStatus,
  onEnable,
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
  onSend,
  logEntries,
  logRef,
  onClearLog,
  profile,
  profileStatus,
  profileLoading,
  onRefreshProfile,
  onProfileTabOpen,
  adminUsers,
  adminUsersStatus,
  adminEvents,
  adminEventsStatus,
  adminNotifications,
  adminNotificationsStatus,
  adminLoading,
  onAdminTabOpen,
  onAdminRefresh,
  onDeleteAdminUser,
  onDeleteAdminEvent,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('device')

  return (
    <div className="main-page">
      <header className="main-header">
        <span className="main-app-name">
          <span
            className={`live-dot${deviceToken ? ' live' : ''}`}
            title={deviceToken ? 'Device registered for push' : 'No device registered yet'}
          />
          Notification Console
        </span>
        <div className="main-header-right">
          <HealthBadge health={health} />
          {isLoggedIn ? (
            <>
              <span className="muted main-email">{email}</span>
              <button type="button" onClick={onLogout}>Sign out</button>
            </>
          ) : (
            <>
              <span className="muted main-email">Guest</span>
              <button type="button" onClick={onSignIn}>Sign in</button>
            </>
          )}
        </div>
      </header>

      <div className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => {
              setActiveTab(tab.id)
              if (tab.id === 'profile') onProfileTabOpen()
              if (tab.id === 'admin') onAdminTabOpen()
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {activeTab === 'device' && (
          <DeviceSection
            isLoggedIn={canUseGuestServices}
            deviceToken={deviceToken}
            deviceStatus={deviceStatus}
            onEnable={onEnable}
          />
        )}
        {activeTab === 'event' && (
          <EventSection
            isLoggedIn={isLoggedIn}
            eventTitle={eventTitle}
            setEventTitle={setEventTitle}
            eventDesc={eventDesc}
            setEventDesc={setEventDesc}
            eventDate={eventDate}
            setEventDate={setEventDate}
            onCreateEvent={onCreateEvent}
            events={events}
            eventsLoading={eventsLoading}
            onRefreshEvents={onRefreshEvents}
            onDeleteEvent={onDeleteEvent}
          />
        )}
        {activeTab === 'send' && (
          <SendSection
            isLoggedIn={canUseGuestServices}
            sendMode={sendMode}
            setSendMode={setSendMode}
            sendUserId={sendUserId}
            setSendUserId={setSendUserId}
            sendEventId={sendEventId}
            setSendEventId={setSendEventId}
            events={events}
            sendTitle={sendTitle}
            setSendTitle={setSendTitle}
            sendBody={sendBody}
            setSendBody={setSendBody}
            onSend={onSend}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileSection
            isLoggedIn={isLoggedIn}
            profile={profile}
            profileStatus={profileStatus}
            loading={profileLoading}
            onRefresh={onRefreshProfile}
          />
        )}
        {activeTab === 'admin' && (
          <AdminSection
            isLoggedIn={isLoggedIn}
            users={adminUsers}
            usersStatus={adminUsersStatus}
            events={adminEvents}
            eventsStatus={adminEventsStatus}
            notifications={adminNotifications}
            notificationsStatus={adminNotificationsStatus}
            loading={adminLoading}
            onRefresh={onAdminRefresh}
            onDeleteUser={onDeleteAdminUser}
            onDeleteEvent={onDeleteAdminEvent}
          />
        )}
      </div>

      <ResultLog
        entries={logEntries}
        logRef={logRef}
        onClear={onClearLog}
      />
    </div>
  )
}
