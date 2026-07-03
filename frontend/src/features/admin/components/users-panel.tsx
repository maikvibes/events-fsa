import { useEffect, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, SearchIcon, Trash2Icon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useAdminUsers, useDeleteAdminUser, useUpdateUserRole } from '@/features/admin/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { Role } from '@/types'

type SortField = 'name' | 'email' | 'createdAt'
type SortOrder = 'asc' | 'desc'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string
  field: SortField
  sortBy: SortField
  sortOrder: SortOrder
  onSort: (field: SortField) => void
}) {
  const isActive = sortBy === field
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {isActive &&
          (sortOrder === 'asc' ? (
            <ArrowUpIcon className="size-3.5" />
          ) : (
            <ArrowDownIcon className="size-3.5" />
          ))}
      </button>
    </TableHead>
  )
}

export function UsersPanel() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const search = useDebouncedValue(searchInput, 300)

  useEffect(() => {
    setPage(1)
  }, [search, role, createdFrom, createdTo])

  const users = useAdminUsers({
    page,
    pageSize,
    search: search || undefined,
    role: role === 'all' ? undefined : role,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sortBy,
    sortOrder,
  })
  const deleteUser = useDeleteAdminUser()
  const updateRole = useUpdateUserRole()

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  if (users.isLoading) return <Skeleton className="h-64" />

  const items = users.data?.items ?? []
  const total = users.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasFilters = Boolean(search || role !== 'all' || createdFrom || createdTo)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="users-search" className="text-xs text-muted-foreground">
            Search
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="users-search"
              placeholder="Name or email"
              className="w-56 pl-8"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Role</label>
          <Select value={role} onValueChange={(v) => setRole(v as Role | 'all')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="users-created-from" className="text-xs text-muted-foreground">
            Joined after
          </label>
          <Input
            id="users-created-from"
            type="date"
            className="w-40"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="users-created-to" className="text-xs text-muted-foreground">
            Joined before
          </label>
          <Input
            id="users-created-to"
            type="date"
            className="w-40"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('')
              setRole('all')
              setCreatedFrom('')
              setCreatedTo('')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No users found</EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? 'No users match these filters.'
                : "Either there are no accounts yet, or you don't have admin access."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader label="Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Email" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader
                label="Joined"
                field="createdAt"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => {
              const isDeleting = deleteUser.isPending && deleteUser.variables === u.userId
              const isChangingRole = updateRole.isPending && updateRole.variables?.userId === u.userId
              return (
                <TableRow key={u.userId}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      disabled={isChangingRole}
                      onValueChange={(v) => updateRole.mutate({ userId: u.userId, role: v as Role })}
                    >
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" disabled={isDeleting}>
                          {isDeleting ? <Spinner /> : <Trash2Icon />}
                        </Button>
                      }
                      title="Delete this user?"
                      description={`This permanently deletes ${u.email} and their sessions. This cannot be undone.`}
                      onConfirm={() => deleteUser.mutate(u.userId)}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {total === 0
            ? '0 users'
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} users`}
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="px-2 text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
