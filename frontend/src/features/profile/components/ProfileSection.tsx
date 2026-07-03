import { type StatusState } from '@/types'
import { type ProfileData } from '@/features/profile/hooks/useProfile'
import CopyButton from '@/components/common/CopyButton'

interface Props {
  isLoggedIn: boolean
  profile: ProfileData | null
  profileStatus: StatusState
  loading: boolean
  onRefresh: () => void
}

export default function ProfileSection({ isLoggedIn, profile, profileStatus, loading, onRefresh }: Props) {
  return (
    <section data-locked={!isLoggedIn ? '' : undefined}>
      <h2>Your profile</h2>
      <p className="muted">
        Fetches your account details from the backend via GET /auth/profile.
      </p>
      <button type="button" className="primary" disabled={!isLoggedIn || loading} onClick={onRefresh}>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
      <div className={`status ${profileStatus.kind}`}>
        <span className="status-dot" />
        {profileStatus.msg}
      </div>
      {profile && (
        <>
          <div className="field-label-row">
            <label htmlFor="profile-user-id">User ID</label>
            <CopyButton value={profile.userId} />
          </div>
          <input id="profile-user-id" readOnly value={profile.userId} className="mono-token" />
          <label htmlFor="profile-email">Email</label>
          <input id="profile-email" readOnly value={profile.email} />
          <label htmlFor="profile-name">Name</label>
          <input id="profile-name" readOnly value={profile.name} />
        </>
      )}
    </section>
  )
}
