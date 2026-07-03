import { useState } from 'react'
import { type RefObject } from 'react'
import { type StatusState, type LogEntry, type EventItem } from '@/types'
import DeviceSection from '@/features/device/components/DeviceSection'
import EventSection from '@/features/event/components/EventSection'
import SendSection from '@/features/send/components/SendSection'
import ResultLog from '@/components/common/ResultLog'

type Tab = 'device' | 'event' | 'send'

interface Props {
  // auth
  isLoggedIn: boolean
  email: string | null
  onLogout: () => void
  onSignIn: () => void
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
  sendUserId: string
  setSendUserId: (v: string) => void
  sendDeviceToken: string
  setSendDeviceToken: (v: string) => void
  sendTitle: string
  setSendTitle: (v: string) => void
  sendBody: string
  setSendBody: (v: string) => void
  onSend: () => void
  // log
  logEntries: LogEntry[]
  logRef: RefObject<HTMLPreElement | null>
  onClearLog: () => void
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'device', label: 'Register Device' },
  { id: 'event', label: 'Create Event' },
  { id: 'send', label: 'Send Notification' },
]

export default function MainApp({
  isLoggedIn,
  email,
  onLogout,
  onSignIn,
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
  sendUserId,
  setSendUserId,
  sendDeviceToken,
  setSendDeviceToken,
  sendTitle,
  setSendTitle,
  sendBody,
  setSendBody,
  onSend,
  logEntries,
  logRef,
  onClearLog,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('device')

  return (
    <div className="main-page">
      <header className="main-header">
        <span className="main-app-name">Notification Console</span>
        <div className="main-header-right">
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
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {activeTab === 'device' && (
          <DeviceSection
            isLoggedIn={isLoggedIn}
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
            isLoggedIn={isLoggedIn}
            sendUserId={sendUserId}
            setSendUserId={setSendUserId}
            sendDeviceToken={sendDeviceToken}
            setSendDeviceToken={setSendDeviceToken}
            sendTitle={sendTitle}
            setSendTitle={setSendTitle}
            sendBody={sendBody}
            setSendBody={setSendBody}
            onSend={onSend}
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
