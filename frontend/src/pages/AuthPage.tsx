import { type StatusState } from '@/types'
import { type HealthState } from '@/features/health/hooks/useHealth'
import AuthCard from '@/features/auth/components/AuthCard'
import HealthBadge from '@/components/common/HealthBadge'

interface Props {
  authStatus: StatusState
  name: string
  setName: (v: string) => void
  authEmail: string
  setAuthEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  onRegister: () => void
  onLogin: () => void
  onBack: () => void
  health: HealthState
}

export default function AuthPage({ onBack, health, ...cardProps }: Props) {
  return (
    <div className="auth-page">
      <div className="auth-page-topbar">
        <button type="button" className="auth-page-back" onClick={onBack}>
          ← Back to console
        </button>
        <HealthBadge health={health} />
      </div>
      <div className="auth-page-center">
        <AuthCard {...cardProps} />
      </div>
    </div>
  )
}
