import { useEffect, useRef, useState } from 'react'
import * as profileApi from '@/features/profile/api/profile.api'
import { ApiError } from '@/services/http/client'
import { type LogKind, type StatusState, esc } from '@/types'

export interface ProfileData {
  userId: string
  email: string
  name: string
}

interface UseProfileParams {
  token: string | null
  isLoggedIn: boolean
  addLog: (kind: LogKind, label: string, detail?: string) => void
}

export function useProfile({ token, isLoggedIn, addLog }: UseProfileParams) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [profileStatus, setProfileStatus] = useState<StatusState>({
    msg: 'Sign in, then open this tab to load your profile.',
    kind: 'info',
  })
  const [loading, setLoading] = useState(false)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!isLoggedIn) {
      hasLoadedRef.current = false
      setProfile(null)
      setProfileStatus({ msg: 'Sign in, then open this tab to load your profile.', kind: 'info' })
    }
  }, [isLoggedIn])

  async function loadProfile() {
    if (!isLoggedIn) {
      setProfileStatus({ msg: 'Sign in to view your profile.', kind: 'err' })
      return
    }
    hasLoadedRef.current = true
    setLoading(true)
    setProfileStatus({ msg: 'Loading profile…', kind: 'info' })
    try {
      const data = await profileApi.getProfile(token)
      const profileData: ProfileData = {
        userId: String(data.userId ?? ''),
        email: String(data.email ?? ''),
        name: String(data.name ?? ''),
      }
      setProfile(profileData)
      setProfileStatus({ msg: 'Profile loaded.', kind: 'ok' })
      addLog('ok', 'profile', `userId ${esc(profileData.userId)}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const hint = e instanceof ApiError && e.statusCode === 404
        ? ' The backend route for this may not be implemented yet.'
        : ''
      setProfileStatus({ msg: 'Failed to load profile: ' + msg + hint, kind: 'err' })
      addLog('err', 'profile failed', esc(msg))
    } finally {
      setLoading(false)
    }
  }

  function onTabOpen() {
    if (hasLoadedRef.current || !isLoggedIn) return
    loadProfile()
  }

  return { profile, profileStatus, loading, loadProfile, onTabOpen }
}
