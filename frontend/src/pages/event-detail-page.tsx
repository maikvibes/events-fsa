import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarIcon, PencilIcon, StarIcon, Trash2Icon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useDeleteEvent, useEvent, useFollowEvent, useMyEvents, useUnfollowEvent } from '@/features/events/hooks'
import { AnnounceDialog } from '@/features/events/components/announce-dialog'

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const event = useEvent(eventId)
  const myEvents = useMyEvents()
  const follow = useFollowEvent()
  const unfollow = useUnfollowEvent()
  const deleteEvent = useDeleteEvent()

  if (event.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (!event.data) {
    return <p className="text-sm text-muted-foreground">Event not found.</p>
  }

  const data = event.data
  const isFollowing = myEvents.data?.some((e) => e.eventId === data.eventId) ?? false
  const pending = follow.isPending || unfollow.isPending

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/events" />}>Browse events</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">{data.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{data.title}</CardTitle>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarIcon className="size-4" />
                {new Date(data.date).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={isFollowing ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => (isFollowing ? unfollow.mutate(data.eventId) : follow.mutate(data.eventId))}
              >
                {pending ? <Spinner data-icon="inline-start" /> : <StarIcon data-icon="inline-start" className={isFollowing ? 'fill-current' : ''} />}
                {isFollowing ? 'Following' : 'Follow'}
              </Button>
              <AnnounceDialog eventId={data.eventId} />
              <Link to={`/events/${data.eventId}/edit`} className={buttonVariants({ variant: 'outline' })}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Link>
              <ConfirmDialog
                trigger={
                  <Button variant="destructive">
                    <Trash2Icon data-icon="inline-start" />
                    Delete
                  </Button>
                }
                title="Delete this event?"
                description="This permanently removes the event and its follower list. This action cannot be undone."
                onConfirm={() =>
                  deleteEvent.mutate(data.eventId, {
                    onSuccess: () => navigate('/events'),
                  })
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.description}</p>
        </CardContent>
      </Card>
    </div>
  )
}
