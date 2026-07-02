import { type StatusState } from '@/types'
import AuthCard from './AuthCard'

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
  onClose: () => void
}

export default function AuthModal({ onClose, ...cardProps }: Props) {
  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal-content" onClick={e => e.stopPropagation()}>
        <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <AuthCard {...cardProps} />
      </div>
    </div>
  )
}
