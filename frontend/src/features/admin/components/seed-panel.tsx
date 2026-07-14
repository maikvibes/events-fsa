import { useState } from 'react'
import { DatabaseIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Label } from '@/components/ui/label'
import { useStartSeed, useSeedProgress } from '@/features/admin/hooks'
import type { SeedPartProgress } from '@/types'

const SIZES = [
  { label: '10k', count: 10_000 },
  { label: '100k', count: 100_000 },
  { label: '1M', count: 1_000_000 },
]

function pct(p: SeedPartProgress) {
  if (!p.total) return 0
  return Math.min(100, Math.round((p.done / p.total) * 100))
}

function ProgressRow({ name, part }: { name: string; part: SeedPartProgress }) {
  const value = pct(part)
  const color =
    part.status === 'error' ? 'bg-red-500' : part.status === 'done' ? 'bg-emerald-500' : 'bg-blue-500'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{name}</span>
        <span className="tabular-nums text-muted-foreground">
          {part.done.toLocaleString()}
          {part.total ? ` / ${part.total.toLocaleString()}` : ''} · {value}%
          {part.status === 'error' && ' · error'}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded bg-muted">
        <div className={`h-full rounded ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function SeedPanel() {
  const [fresh, setFresh] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const start = useStartSeed()
  const progress = useSeedProgress(jobId)
  const job = progress.data ?? null
  const running = !!jobId && !(job?.finished ?? false)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseIcon className="size-4" />
          Seed the database
        </CardTitle>
        <CardDescription>
          Bulk-insert users (auth) and device tokens (notifications) for load-testing broadcast fanout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {SIZES.map((s) => (
            <Button
              key={s.count}
              variant="outline"
              disabled={start.isPending || running}
              onClick={() =>
                start.mutate({ count: s.count, fresh }, { onSuccess: (r) => setJobId(r.jobId) })
              }
            >
              {(start.isPending || running) && <Spinner data-icon="inline-start" />}
              Seed {s.label}
            </Button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-current"
              checked={fresh}
              disabled={running}
              onChange={(e) => setFresh(e.target.checked)}
            />
            <Label className="cursor-pointer">Clean existing seed data first</Label>
          </label>
        </div>

        {job && (
          <div className="space-y-4 border-t pt-4">
            <ProgressRow name="Users (auth)" part={job.users} />
            <ProgressRow name="Device tokens (notifications)" part={job.tokens} />
            {job.finished && (
              <p className="text-sm text-emerald-500">
                Done — {job.users.done.toLocaleString()} users, {job.tokens.done.toLocaleString()} device tokens.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
