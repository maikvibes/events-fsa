import { Link } from 'react-router-dom'
import { Bell, CalendarDays, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { PageHeader } from '@/components/common/page-header'
import { useAuth } from '@/contexts/auth-context'
import { useEvents, useMyEvents } from '@/features/events/hooks'
import { useMyNotifications } from '@/features/notifications/hooks'
import { EventCard } from '@/features/events/components/event-card'

function StatCard({ icon: Icon, label, value, loading }: { icon: typeof Star; label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>{loading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-semibold">{value}</div>}</CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const events = useEvents()
  const myEvents = useMyEvents()
  const notifications = useMyNotifications()

  // Backend already orders followed events by date ascending, so the first
  // few are the soonest upcoming ones.
  const upcoming = (myEvents.data ?? []).slice(0, 3)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description="Here's what's happening with the events you follow."
        actions={
          <Link to="/events" className={buttonVariants()}>
            <CalendarDays data-icon="inline-start" />
            Browse events
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={CalendarDays} label="Events available" value={events.data?.length ?? 0} loading={events.isLoading} />
        <StatCard icon={Star} label="Following" value={myEvents.data?.length ?? 0} loading={myEvents.isLoading} />
        <StatCard icon={Bell} label="Notifications received" value={notifications.data?.length ?? 0} loading={notifications.isLoading} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Your upcoming events</h2>
        {myEvents.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Star />
              </EmptyMedia>
              <EmptyTitle>No upcoming events</EmptyTitle>
              <EmptyDescription>Follow events from the browse page to see them here.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link to="/events" className={buttonVariants({ variant: 'outline' })}>
                Browse events
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event) => (
              <EventCard key={event.eventId} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
