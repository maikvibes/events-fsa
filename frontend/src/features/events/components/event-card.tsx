import { Link } from 'react-router-dom'
import { CalendarIcon, StarIcon } from 'lucide-react'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { EventItem } from '@/types'
import { useFollowEvent, useUnfollowEvent } from '@/features/events/hooks'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export function EventCard({ event }: { event: EventItem }) {
  const follow = useFollowEvent()
  const unfollow = useUnfollowEvent()
  const pending = follow.isPending || unfollow.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="line-clamp-1">
          <Link to={`/events/${event.eventId}`} className="hover:underline">
            {event.title}
          </Link>
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <CalendarIcon className="size-3.5" />
          {formatDate(event.date)}
        </CardDescription>
        <CardAction>
          <Button
            variant={event.isFollowing ? 'secondary' : 'outline'}
            size="sm"
            disabled={pending}
            onClick={() => (event.isFollowing ? unfollow.mutate(event.eventId) : follow.mutate(event.eventId))}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <StarIcon data-icon="inline-start" className={event.isFollowing ? 'fill-current' : ''} />
            )}
            {event.isFollowing ? 'Following' : 'Follow'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-2 text-sm text-muted-foreground">{event.description}</p>
      </CardContent>
      <CardFooter>
        <Link to={`/events/${event.eventId}`} className={buttonVariants({ variant: 'link', size: 'sm', className: 'px-0' })}>
          View details
        </Link>
      </CardFooter>
    </Card>
  )
}
