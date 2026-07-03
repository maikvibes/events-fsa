import { BellIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useAdminNotifications } from '@/features/admin/hooks'

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  const s = status.toLowerCase()
  if (s.includes('fail') || s.includes('error')) return 'destructive'
  if (s.includes('sent') || s.includes('ok') || s.includes('deliver')) return 'default'
  return 'secondary'
}

export function NotificationsPanel() {
  const notifications = useAdminNotifications()

  if (notifications.isLoading) return <Skeleton className="h-64" />

  if ((notifications.data ?? []).length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellIcon />
          </EmptyMedia>
          <EmptyTitle>No notifications logged</EmptyTitle>
          <EmptyDescription>Sent and broadcast notifications will show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
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
        {(notifications.data ?? []).map((n) => (
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
  )
}
