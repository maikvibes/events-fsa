export type LogKind = 'ok' | 'err'
export type StatusKind = 'ok' | 'err' | 'info'

export interface StatusState {
  msg: string
  kind: StatusKind
}

export interface LogEntry {
  id: number
  time: string
  kind: LogKind
  label: string
  detail?: string
}

export interface EventItem {
  id: string
  userId: string
  title: string
  description: string
  date: string
  createdAt: string
  updatedAt: string
}

export function esc(v: string): string {
  return String(v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c))
}

let logSeq = 0
export function nextLogId(): number {
  return logSeq++
}
