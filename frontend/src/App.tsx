import { useEffect, useState } from 'react'
import { onMessage } from 'firebase/messaging'
import { getMessagingIfSupported } from '@/lib/firebase'
import { useLog } from '@/hooks/useLog'
import { useGuestId } from '@/hooks/useGuestId'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useFcm } from '@/features/device/hooks/useFcm'
import { useSend } from '@/features/send/hooks/useSend'
import { useEvent } from '@/features/event/hooks/useEvent'
import { useHealth } from '@/features/health/hooks/useHealth'
import AuthPage from '@/pages/AuthPage'
import MainApp from '@/pages/MainApp'
import { esc } from '@/types'
import './App.css'

export default function App() {
  const log = useLog()
  const auth = useAuth(log.add)
  const guestId = useGuestId()
  const isLoggedIn = !!auth.token
  const userId = auth.userId ?? guestId
  const health = useHealth()
  const [showAuthPage, setShowAuthPage] = useState(false)
  const [prevIsLoggedIn, setPrevIsLoggedIn] = useState(isLoggedIn)
  if (isLoggedIn !== prevIsLoggedIn) {
    setPrevIsLoggedIn(isLoggedIn)
    if (isLoggedIn) setShowAuthPage(false)
  }
  const fcm = useFcm({ userId, token: auth.token, addLog: log.add })
  const send = useSend({ userId, token: auth.token, deviceToken: fcm.deviceToken, addLog: log.add })
  const event = useEvent({ token: auth.token, addLog: log.add })

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    getMessagingIfSupported().then((messaging) => {
      if (!messaging) return
      unsubscribe = onMessage(messaging, (payload) => {
        const n = payload.notification ?? {}
        log.add('ok', 'push received (foreground)', `${esc(n.title ?? '(no title)')} — ${esc(n.body ?? '')}`)
      })
    })
    return () => unsubscribe?.()
  }, [])

  if (showAuthPage) {
    return (
      <AuthPage
        authStatus={auth.authStatus}
        name={auth.name}
        setName={auth.setName}
        authEmail={auth.authEmail}
        setAuthEmail={auth.setAuthEmail}
        password={auth.password}
        setPassword={auth.setPassword}
        onRegister={auth.register}
        onLogin={auth.login}
        onBack={() => setShowAuthPage(false)}
        health={health}
      />
    )
  }

  return (
    <>
      <MainApp
        isLoggedIn={isLoggedIn}
        email={auth.email}
        onLogout={auth.logout}
        onSignIn={() => setShowAuthPage(true)}
        health={health}
        deviceToken={fcm.deviceToken}
        deviceStatus={fcm.deviceStatus}
        onEnable={fcm.enable}
        eventTitle={event.eventTitle}
        setEventTitle={event.setEventTitle}
        eventDesc={event.eventDesc}
        setEventDesc={event.setEventDesc}
        eventDate={event.eventDate}
        setEventDate={event.setEventDate}
        onCreateEvent={event.createEvent}
        events={event.events}
        eventsLoading={event.eventsLoading}
        onRefreshEvents={event.loadEvents}
        onDeleteEvent={event.removeEvent}
        sendUserId={send.sendUserId}
        setSendUserId={send.setSendUserId}
        sendDeviceToken={send.sendDeviceToken}
        setSendDeviceToken={send.setSendDeviceToken}
        sendTitle={send.sendTitle}
        setSendTitle={send.setSendTitle}
        sendBody={send.sendBody}
        setSendBody={send.setSendBody}
        onSend={send.send}
        logEntries={log.entries}
        logRef={log.ref}
        onClearLog={log.clear}
      />
    </>
  )
}
