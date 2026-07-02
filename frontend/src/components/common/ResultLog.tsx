import { type RefObject } from 'react'
import { type LogEntry } from '@/types'

interface Props {
  entries: LogEntry[]
  logRef: RefObject<HTMLPreElement | null>
  onClear: () => void
  className?: string
}

export default function ResultLog({ entries, logRef, onClear, className }: Props) {
  return (
    <section className={className}>
      <h2>Result log</h2>
      <button type="button" onClick={onClear}>Clear</button>
      <pre ref={logRef} className="log">
        {entries.map(entry => (
          <div key={entry.id}>
            <span className="log-meta">[{entry.time}]</span>{' '}
            <span className={entry.kind === 'err' ? 'log-err' : 'log-ok'}>{entry.label}</span>
            {entry.detail && <span className="log-meta"> {entry.detail}</span>}
          </div>
        ))}
      </pre>
    </section>
  )
}
