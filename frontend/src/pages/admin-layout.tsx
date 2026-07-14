import { Outlet } from 'react-router-dom'
import { PageHeader } from '@/components/common/page-header'

export default function AdminLayout() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Admin console" description="Manage users, events, and notifications." />
      <Outlet />
    </div>
  )
}
