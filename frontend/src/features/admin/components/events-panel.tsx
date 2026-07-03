import { Link } from 'react-router-dom'
import { CalendarDaysIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useDeleteEvent, useEvents } from '@/features/events/hooks'

export function EventsPanel() {
  const events = useEvents()
  const deleteEvent = useDeleteEvent()

  if (events.isLoading) return <Skeleton className="h-64" />

  if ((events.data ?? []).length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDaysIcon />
          </EmptyMedia>
          <EmptyTitle>No events yet</EmptyTitle>
          <EmptyDescription>Create the first event for people to follow.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/events/new" className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            New event
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link to="/events/new" className={buttonVariants({ size: 'sm' })}>
          <PlusIcon data-icon="inline-start" />
          New event
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(events.data ?? []).map((e) => (
            <TableRow key={e.eventId}>
              <TableCell className="font-medium">
                <Link to={`/events/${e.eventId}`} className="hover:underline">
                  {e.title}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{new Date(e.date).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Link to={`/events/${e.eventId}/edit`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
                    <PencilIcon />
                  </Link>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm">
                        <Trash2Icon />
                      </Button>
                    }
                    title="Delete this event?"
                    description="This permanently removes the event and its follower list."
                    onConfirm={() => deleteEvent.mutate(e.eventId)}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
