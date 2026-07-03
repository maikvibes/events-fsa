import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/page-header'
import { UsersPanel } from '@/features/admin/components/users-panel'
import { EventsPanel } from '@/features/admin/components/events-panel'
import { NotificationsPanel } from '@/features/admin/components/notifications-panel'
import { BroadcastPanel } from '@/features/admin/components/broadcast-panel'

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Admin console" description="Manage users, events, and notifications." />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="broadcast">Send</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="events">
          <EventsPanel />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsPanel />
        </TabsContent>
        <TabsContent value="broadcast">
          <BroadcastPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
