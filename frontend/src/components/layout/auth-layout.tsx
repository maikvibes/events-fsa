import type { ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'
import heroImage from '@/assets/hero.png'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CalendarDays className="size-4" />
          </div>
          <span className="font-semibold">Eventide</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.4]" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-foreground">
          <p className="max-w-md text-lg font-medium">
            Follow the events you care about and never miss an update.
          </p>
        </div>
      </div>
    </div>
  )
}
