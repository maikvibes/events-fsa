import { useState, useRef, useEffect, useCallback } from 'react'
import { type LogEntry, type LogKind, nextLogId } from '@/types'

export function useLog() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [entries])

  const add = useCallback((kind: LogKind, label: string, detail?: string) => {
    const time = new Date().toLocaleTimeString()
    setEntries(prev => [...prev, { id: nextLogId(), time, kind, label, detail }])
  }, [])

  const clear = useCallback(() => {
    setEntries([])
  }, [])

  return { entries, ref, add, clear }
}
