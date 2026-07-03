import { useState } from 'react'
import { type StatusState } from '@/types'

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
}

type AuthMode = 'signin' | 'create'

export default function AuthCard({
  authStatus,
  name,
  setName,
  authEmail,
  setAuthEmail,
  password,
  setPassword,
  onRegister,
  onLogin,
}: Props) {
  const [mode, setMode] = useState<AuthMode>('signin')

  return (
    <div className="auth-card">
      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab${mode === 'signin' ? ' active' : ''}`}
          onClick={() => setMode('signin')}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`auth-tab${mode === 'create' ? ' active' : ''}`}
          onClick={() => setMode('create')}
        >
          Create account
        </button>
      </div>

      <div className="auth-card-body">
        {mode === 'create' && (
          <>
            <label htmlFor="auth-name">Name</label>
            <input
              id="auth-name"
              placeholder="Ada Lovelace"
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </>
        )}

        <label htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={authEmail}
          onChange={e => setAuthEmail(e.target.value)}
        />

        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          type="password"
          placeholder="••••••••"
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        {mode === 'create' ? (
          <button type="button" className="primary auth-submit" onClick={onRegister}>
            Create account
          </button>
        ) : (
          <button type="button" className="primary auth-submit" onClick={onLogin}>
            Sign in
          </button>
        )}

        <div className={`status ${authStatus.kind}`}>
          <span className="status-dot" />
          {authStatus.msg}
        </div>

        <p className="auth-switch">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button type="button" className="auth-link" onClick={() => setMode('create')}>
                Create account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="auth-link" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
