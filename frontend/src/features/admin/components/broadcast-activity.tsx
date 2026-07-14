import { useState } from 'react'
import { ActivityIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useBroadcastRun, useBroadcastRuns } from '@/features/notifications/hooks'
import type { BroadcastRunStatus } from '@/types'

const STATUS_VARIANT: Record<BroadcastRunStatus, { label: string; className: string }> = {
  dispatched: { label: 'Dispatched', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In progress', className: 'bg-blue-500/15 text-blue-500' },
  completed: { label: 'Completed', className: 'bg-emerald-500/15 text-emerald-500' },
}

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString()
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

/**
 * Live view of broadcast fanout across the notifications worker pool, plus a
 * run-history list. `activeId` (the run just fired from the panel) auto-selects;
 * otherwise the most recent run is shown.
 */
export function BroadcastActivity({ activeId }: { activeId: string | null }) {
  const runs = useBroadcastRuns()
  // A run the user explicitly clicked in the history list overrides everything;
  // otherwise show the just-fired run, else the most recent one.
  const [picked, setPicked] = useState<string | null>(null)
  const effectiveId = picked ?? activeId ?? runs.data?.[0]?.broadcastId ?? null

  const detail = useBroadcastRun(effectiveId)
  const run = detail.data ?? null
  const maxBatches = Math.max(1, ...(run?.instances ?? []).map((i) => i.batches))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ActivityIcon className="size-4" />
          Broadcast fanout activity
        </CardTitle>
        <CardDescription>Per-worker delivery for each broadcast, tracked in the analytics service.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {run ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={STATUS_VARIANT[run.status].className}>{STATUS_VARIANT[run.status].label}</Badge>
              <span className="truncate text-sm font-medium">{run.title || '(untitled)'}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat label="Instances" value={fmt(run.instanceCount)} />
              <Stat
                label="Batches"
                value={`${fmt(run.receivedBatches)}${run.totalBatches != null ? ` / ${fmt(run.totalBatches)}` : ''}`}
              />
              <Stat label="Sent" value={<span className="text-emerald-500">{fmt(run.sent)}</span>} />
              <Stat label="Failed" value={<span className="text-red-500">{fmt(run.failed)}</span>} />
              <Stat label="Tokens" value={fmt(run.totalTokens)} />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Batches per instance
              </div>
              {run.instances.length === 0 && (
                <div className="text-sm text-muted-foreground">Waiting for worker completions…</div>
              )}
              {run.instances.map((i) => (
                <div key={i.instance} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 truncate font-mono text-xs" title={i.instance}>
                    {i.instance}
                  </div>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                      style={{ width: `${(i.batches / maxBatches) * 100}%` }}
                    />
                  </div>
                  <div className="w-40 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {fmt(i.batches)} batches · {fmt(i.sent)} sent
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {runs.isLoading ? 'Loading…' : 'No broadcasts yet — send one to see live fanout.'}
          </div>
        )}

        {(runs.data?.length ?? 0) > 0 && (
          <div className="space-y-1 border-t pt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent runs</div>
            <div className="max-h-56 overflow-y-auto">
              {runs.data!.map((r) => (
                <button
                  key={r.broadcastId}
                  onClick={() => setPicked(r.broadcastId)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
                    r.broadcastId === effectiveId ? 'bg-muted' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge className={`${STATUS_VARIANT[r.status].className} shrink-0`}>
                      {STATUS_VARIANT[r.status].label}
                    </Badge>
                    <span className="truncate">{r.title || '(untitled)'}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {fmt(r.sent)} sent · {new Date(r.requestedAt).toLocaleTimeString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
