import { useEffect, useState } from 'react'
import { onMessage } from 'firebase/messaging'
import { getMessagingIfSupported } from '@/lib/firebase'
import { useLog } from '@/hooks/useLog'
import { useGuestSession } from '@/hooks/useGuestSession'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useFcm } from '@/features/device/hooks/useFcm'
import { useSend } from '@/features/send/hooks/useSend'
import { useEvent } from '@/features/event/hooks/useEvent'
import { useProfile } from '@/features/profile/hooks/useProfile'
import { useHealth } from '@/features/health/hooks/useHealth'
import AuthPage from '@/pages/AuthPage'
import MainApp from '@/pages/MainApp'
import { esc } from '@/types'
import './App.css'

export default function App() {
  const log = useLog()
  const auth = useAuth(log.add)
  const guestSession = useGuestSession()
  const isLoggedIn = !!auth.token
  const canUseGuestServices = isLoggedIn || guestSession.ready
  const userId = auth.userId ?? guestSession.userId
  const health = useHealth()
  const [showAuthPage, setShowAuthPage] = useState(false)
  const [prevIsLoggedIn, setPrevIsLoggedIn] = useState(isLoggedIn)
  if (isLoggedIn !== prevIsLoggedIn) {
    setPrevIsLoggedIn(isLoggedIn)
    if (isLoggedIn) setShowAuthPage(false)
  }
  const serviceToken = auth.token ?? guestSession.token
  const fcm = useFcm({ userId, token: serviceToken, addLog: log.add })
  const send = useSend({ userId, token: serviceToken, addLog: log.add })
  const event = useEvent({ token: auth.token, addLog: log.add })
  const profile = useProfile({ token: auth.token, isLoggedIn, addLog: log.add })

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
        canUseGuestServices={canUseGuestServices}
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
        sendMode={send.sendMode}
        setSendMode={send.setSendMode}
        sendUserId={send.sendUserId}
        setSendUserId={send.setSendUserId}
        sendEventId={send.sendEventId}
        setSendEventId={send.setSendEventId}
        sendTitle={send.sendTitle}
        setSendTitle={send.setSendTitle}
        sendBody={send.sendBody}
        setSendBody={send.setSendBody}
        onSend={send.send}
        logEntries={log.entries}
        logRef={log.ref}
        onClearLog={log.clear}
        profile={profile.profile}
        profileStatus={profile.profileStatus}
        profileLoading={profile.loading}
        onRefreshProfile={profile.loadProfile}
        onProfileTabOpen={profile.onTabOpen}
      />
    </>
  )
}
