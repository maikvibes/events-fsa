import { NavLink, useLocation } from 'react-router-dom'
import { Bell, CalendarDays, LayoutDashboard, Star, User as UserIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useAuth } from '@/contexts/auth-context'
import { adminSections } from '@/features/admin/admin-sections'

const mainNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/events', label: 'Browse events', icon: CalendarDays, end: false },
  { to: '/my-events', label: 'My events', icon: Star, end: false },
  { to: '/notifications', label: 'Notifications', icon: Bell, end: false },
]

export function AppSidebar() {
  const { user } = useAuth()
  const location = useLocation()

  function isActive(to: string, end: boolean) {
    return end ? location.pathname === to : location.pathname.startsWith(to)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<NavLink to="/" />}>
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CalendarDays className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Eventide</span>
                <span className="text-xs text-muted-foreground">Events &amp; notifications</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={isActive(item.to, item.end)}
                    render={<NavLink to={item.to} end={item.end} />}
                  >
                    <item.icon data-icon="inline-start" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {user?.role === 'admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminSections.map((section) => (
                  <SidebarMenuItem key={section.to}>
                    <SidebarMenuButton
                      tooltip={section.label}
                      isActive={isActive(section.to, false)}
                      render={<NavLink to={section.to} />}
                    >
                      <section.icon data-icon="inline-start" />
                      <span>{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={user?.email} isActive={isActive('/profile', false)} render={<NavLink to="/profile" />}>
              <UserIcon data-icon="inline-start" />
              <span className="truncate">{user?.name ?? 'Profile'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
