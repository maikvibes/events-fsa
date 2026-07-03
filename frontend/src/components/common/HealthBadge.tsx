import { type HealthState } from '@/features/health/hooks/useHealth'

const LABEL: Record<HealthState, string> = {
  checking: 'Checking API…',
  online: 'API online',
  offline: 'API unreachable',
}

export default function HealthBadge({ health }: { health: HealthState }) {
  return (
    <span className={`health-badge ${health}`} title={LABEL[health]}>
      <span className="status-dot" />
      {LABEL[health]}
    </span>
  )
}
