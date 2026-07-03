import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'
import { EventForm } from '@/features/events/components/event-form'
import { useCreateEvent } from '@/features/events/hooks'

export default function NewEventPage() {
  const navigate = useNavigate()
  const createEvent = useCreateEvent()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New event" description="Publish a new event for people to discover and follow." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Event details</CardTitle>
          <CardDescription>Requires admin access — publishing is restricted to organizers.</CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm
            submitLabel="Create event"
            pending={createEvent.isPending}
            onSubmit={(values) =>
              createEvent.mutate(values, {
                onSuccess: (event) => navigate(`/events/${event.eventId}`),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
