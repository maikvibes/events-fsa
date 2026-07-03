import { BellRingIcon, LogOutIcon, MailIcon, UserIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/common/page-header'
import { useAuth } from '@/contexts/auth-context'
import { usePush } from '@/features/push/use-push'

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

const pushStatusLabel: Record<string, string> = {
  idle: 'Not enabled on this device',
  requesting: 'Requesting permission…',
  registering: 'Registering device…',
  enabled: 'Enabled on this device',
  unsupported: 'Not supported in this browser',
  denied: 'Permission denied — check your browser settings',
  error: 'Something went wrong — try again',
}

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const push = usePush()

  if (!user) return null

  const pushBusy = push.status === 'requesting' || push.status === 'registering'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile" description="Your account and notification preferences." />

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback className="text-lg">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{user.name}</CardTitle>
              <CardDescription className="flex items-center gap-1.5">
                <MailIcon className="size-3.5" />
                {user.email}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRingIcon className="size-4" />
            Push notifications
          </CardTitle>
          <CardDescription>Get notified on this device when events you follow send updates.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Badge variant={push.status === 'enabled' ? 'default' : 'secondary'}>{pushStatusLabel[push.status]}</Badge>
          {push.status !== 'enabled' && (
            <Button size="sm" disabled={pushBusy || push.status === 'unsupported'} onClick={() => push.enable()}>
              {pushBusy && <Spinner data-icon="inline-start" />}
              Enable
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="size-4" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
