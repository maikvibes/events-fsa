import { BellIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { PageHeader } from '@/components/common/page-header'
import { useMyNotifications } from '@/features/notifications/hooks'

function statusVariant(status: string): 'success' | 'secondary' | 'destructive' {
  const s = status.toLowerCase()
  if (s.includes('fail') || s.includes('error')) return 'destructive'
  if (s.includes('sent') || s.includes('ok') || s.includes('deliver')) return 'success'
  return 'secondary'
}

export default function NotificationsPage() {
  const notifications = useMyNotifications()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Notifications" description="Your push notification history." />

      {notifications.isLoading ? (
        <Skeleton className="h-64" />
      ) : (notifications.data ?? []).length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellIcon />
            </EmptyMedia>
            <EmptyTitle>No notifications yet</EmptyTitle>
            <EmptyDescription>Follow events and enable push notifications from your profile to get updates.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(notifications.data ?? []).map((n) => (
              <TableRow key={n.id}>
                <TableCell className="font-medium">{n.title}</TableCell>
                <TableCell className="max-w-sm truncate text-muted-foreground">{n.body}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(n.status)}>{n.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
