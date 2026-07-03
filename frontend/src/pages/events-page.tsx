import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { PageHeader } from '@/components/common/page-header'
import { useEvents } from '@/features/events/hooks'
import { EventCard } from '@/features/events/components/event-card'

export default function EventsPage() {
  const events = useEvents()
  const [query, setQuery] = useState('')

  const filtered = (events.data ?? []).filter((e) => e.title.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Browse events"
        description="Discover events and follow the ones you care about."
        actions={
          <Link to="/events/new" className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            New event
          </Link>
        }
      />

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search events…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {events.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No events found</EmptyTitle>
            <EmptyDescription>
              {query ? 'Try a different search term.' : 'There are no events yet — create the first one.'}
            </EmptyDescription>
          </EmptyHeader>
          {!query && (
            <EmptyContent>
              <Link to="/events/new" className={buttonVariants({ variant: 'outline' })}>
                New event
              </Link>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((event) => (
            <EventCard key={event.eventId} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
