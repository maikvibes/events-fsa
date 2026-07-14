import { useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, BellIcon, SearchIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useAdminNotifications } from '@/features/admin/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

type StatusFilter = 'all' | 'sent' | 'failed'
type SortOrder = 'asc' | 'desc'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  const s = status.toLowerCase()
  if (s.includes('fail') || s.includes('error')) return 'destructive'
  if (s.includes('sent') || s.includes('ok') || s.includes('deliver')) return 'default'
  return 'secondary'
}

export function NotificationsPanel() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [userIdInput, setUserIdInput] = useState('')
  const [eventIdInput, setEventIdInput] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const search = useDebouncedValue(searchInput, 300)
  // Only forward id filters once they look like a full UUID — the server
  // rejects malformed ids (z.uuid()), so partial typing shouldn't 400 the list.
  const userId = useDebouncedValue(userIdInput.trim(), 300)
  const eventId = useDebouncedValue(eventIdInput.trim(), 300)
  const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  const userIdFilter = isUuid(userId) ? userId : undefined
  const eventIdFilter = isUuid(eventId) ? eventId : undefined

  // Reset to page 1 whenever a filter changes (during render, per React's
  // "adjust state on prop change" guidance — covers async debounced values too).
  const filterKey = `${search}|${status}|${userIdFilter}|${eventIdFilter}|${createdFrom}|${createdTo}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  const notifications = useAdminNotifications({
    page,
    pageSize,
    search: search || undefined,
    status: status === 'all' ? undefined : status,
    userId: userIdFilter,
    eventId: eventIdFilter,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sortOrder,
  })

  if (notifications.isLoading) return <Skeleton className="h-64" />

  const items = notifications.data?.items ?? []
  const total = notifications.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasFilters = Boolean(
    search || status !== 'all' || userIdInput || eventIdInput || createdFrom || createdTo,
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="notif-search" className="text-xs text-muted-foreground">
            Search
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="notif-search"
              placeholder="Title or body"
              className="w-56 pl-8"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notif-user" className="text-xs text-muted-foreground">
            Recipient user ID
          </label>
          <Input
            id="notif-user"
            placeholder="UUID"
            className="w-64 font-mono text-xs"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notif-event" className="text-xs text-muted-foreground">
            Event ID
          </label>
          <Input
            id="notif-event"
            placeholder="UUID"
            className="w-64 font-mono text-xs"
            value={eventIdInput}
            onChange={(e) => setEventIdInput(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notif-from" className="text-xs text-muted-foreground">
            Sent after
          </label>
          <Input
            id="notif-from"
            type="date"
            className="w-40"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notif-to" className="text-xs text-muted-foreground">
            Sent before
          </label>
          <Input
            id="notif-to"
            type="date"
            className="w-40"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
        >
          {sortOrder === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />}
          {sortOrder === 'asc' ? 'Oldest' : 'Newest'}
        </Button>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('')
              setStatus('all')
              setUserIdInput('')
              setEventIdInput('')
              setCreatedFrom('')
              setCreatedTo('')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellIcon />
            </EmptyMedia>
            <EmptyTitle>No notifications logged</EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? 'No notifications match these filters.'
                : 'Sent and broadcast notifications will show up here.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{n.userId}</TableCell>
                <TableCell className="font-medium">{n.title}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(n.status)}>{n.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {total === 0
            ? '0 notifications'
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} notifications`}
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="px-2 text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
