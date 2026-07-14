import { Bell, CalendarDays, Megaphone, Users, type LucideIcon } from 'lucide-react'

// Single source of truth for the admin sections — consumed by both the in-page
// AdminNav tab bar and the global sidebar's Administration group. Each `to` is a
// child route under /admin (see App.tsx); add one here and it appears in both.
export interface AdminSection {
  to: string
  label: string
  icon: LucideIcon
}

export const adminSections: AdminSection[] = [
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/events', label: 'Events', icon: CalendarDays },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/broadcast', label: 'Send', icon: Megaphone },
]
