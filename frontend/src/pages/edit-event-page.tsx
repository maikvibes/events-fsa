import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/common/page-header'
import { EventForm } from '@/features/events/components/event-form'
import { useEvent, useUpdateEvent } from '@/features/events/hooks'

export default function EditEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const event = useEvent(eventId)
  const updateEvent = useUpdateEvent()
  const data = event.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Edit event" description="Update the event details." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Event details</CardTitle>
        </CardHeader>
        <CardContent>
          {event.isLoading || !data ? (
            <Skeleton className="h-64" />
          ) : (
            <EventForm
              event={data}
              submitLabel="Save changes"
              pending={updateEvent.isPending}
              onSubmit={(values) =>
                updateEvent.mutate(
                  { eventId: data.eventId, payload: values },
                  { onSuccess: () => navigate(`/events/${data.eventId}`) },
                )
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
