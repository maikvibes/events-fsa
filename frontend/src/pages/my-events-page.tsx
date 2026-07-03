import { Link } from 'react-router-dom'
import { StarIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { PageHeader } from '@/components/common/page-header'
import { useMyEvents } from '@/features/events/hooks'
import { EventCard } from '@/features/events/components/event-card'

export default function MyEventsPage() {
  const myEvents = useMyEvents()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My events" description="Events you're following." />

      {myEvents.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : (myEvents.data ?? []).length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <StarIcon />
            </EmptyMedia>
            <EmptyTitle>You're not following any events yet</EmptyTitle>
            <EmptyDescription>Browse events and follow the ones you don&apos;t want to miss.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/events" className={buttonVariants()}>
              Browse events
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(myEvents.data ?? []).map((event) => (
            <EventCard key={event.eventId} event={{ ...event, isFollowing: true }} />
          ))}
        </div>
      )}
    </div>
  )
}
