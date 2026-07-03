import { Trash2Icon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useAdminUsers, useDeleteAdminUser } from '@/features/admin/hooks'

export function UsersPanel() {
  const users = useAdminUsers()
  const deleteUser = useDeleteAdminUser()

  if (users.isLoading) return <Skeleton className="h-64" />

  if ((users.data ?? []).length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No users found</EmptyTitle>
          <EmptyDescription>Either there are no accounts yet, or you don&apos;t have admin access.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(users.data ?? []).map((u) => (
          <TableRow key={u.userId}>
            <TableCell className="font-medium">{u.name}</TableCell>
            <TableCell className="text-muted-foreground">{u.email}</TableCell>
            <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
            <TableCell className="text-right">
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon-sm">
                    <Trash2Icon />
                  </Button>
                }
                title="Delete this user?"
                description={`This permanently deletes ${u.email} and their sessions. This cannot be undone.`}
                onConfirm={() => deleteUser.mutate(u.userId)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
