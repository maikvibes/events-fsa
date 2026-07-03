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
      <div className="log-header">
        <h2>
          Result log
          {entries.length > 0 && <span className="log-count">{entries.length}</span>}
        </h2>
        <button type="button" disabled={entries.length === 0} onClick={onClear}>Clear</button>
      </div>
      <pre ref={logRef} className="log">
        {entries.length === 0 ? (
          <div className="log-empty">No activity yet — actions you take will show up here.</div>
        ) : (
          entries.map(entry => (
            <div key={entry.id} className="log-entry">
              <span className={`log-dot ${entry.kind === 'err' ? 'err' : 'ok'}`} />
              <span className="log-meta">[{entry.time}]</span>
              <span className={entry.kind === 'err' ? 'log-err' : 'log-ok'}>{entry.label}</span>
              {entry.detail && <span className="log-meta">{entry.detail}</span>}
            </div>
          ))
        )}
      </pre>
    </section>
  )
}
