import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '@/components/common/page-header'
import { cn } from '@/lib/utils'

// Each entry is a child route under /admin; the layout renders a link-based
// tab bar plus an <Outlet /> for the active section.
const sections = [
  { to: 'users', label: 'Users' },
  { to: 'events', label: 'Events' },
  { to: 'notifications', label: 'Notifications' },
  { to: 'broadcast', label: 'Send' },
]

export default function AdminLayout() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Admin console" description="Manage users, events, and notifications." />

      <nav className="inline-flex w-fit items-center justify-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground">
        {sections.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) =>
              cn(
                'inline-flex h-8 items-center justify-center rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring',
                isActive && 'bg-background text-foreground shadow-sm dark:bg-input/30 dark:text-foreground',
              )
            }
          >
            {section.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
