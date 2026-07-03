import { useEffect, useState } from 'react'
import * as healthApi from '@/features/health/api/health.api'

export type HealthState = 'checking' | 'online' | 'offline'

const POLL_INTERVAL_MS = 20_000

export function useHealth() {
  const [health, setHealth] = useState<HealthState>('checking')

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        await healthApi.getHealth()
        if (!cancelled) setHealth('online')
      } catch {
        if (!cancelled) setHealth('offline')
      }
    }

    check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return health
}
