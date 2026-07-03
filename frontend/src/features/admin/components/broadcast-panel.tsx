import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MegaphoneIcon, SendIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAdminUsers } from '@/features/admin/hooks'
import { useBroadcast, useSendNotification } from '@/features/notifications/hooks'

const messageSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  body: z.string().min(1, 'Message is required').max(500),
})

type MessageValues = z.infer<typeof messageSchema>

export function BroadcastPanel() {
  const users = useAdminUsers({ pageSize: 100, sortBy: 'name', sortOrder: 'asc' })
  const broadcast = useBroadcast()
  const sendToUser = useSendNotification()
  const [recipient, setRecipient] = useState<string>('')

  const broadcastForm = useForm<MessageValues>({ resolver: zodResolver(messageSchema) })
  const sendForm = useForm<MessageValues>({ resolver: zodResolver(messageSchema) })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MegaphoneIcon className="size-4" />
            Broadcast to everyone
          </CardTitle>
          <CardDescription>Send a push notification to every registered device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={broadcastForm.handleSubmit((values) => {
              broadcast.mutate(values, { onSuccess: () => broadcastForm.reset() })
            })}
            noValidate
          >
            <FieldGroup>
              <Field data-invalid={!!broadcastForm.formState.errors.title}>
                <FieldLabel htmlFor="broadcast-title">Title</FieldLabel>
                <Input id="broadcast-title" {...broadcastForm.register('title')} />
                <FieldError errors={[broadcastForm.formState.errors.title]} />
              </Field>
              <Field data-invalid={!!broadcastForm.formState.errors.body}>
                <FieldLabel htmlFor="broadcast-body">Message</FieldLabel>
                <Textarea id="broadcast-body" rows={3} {...broadcastForm.register('body')} />
                <FieldError errors={[broadcastForm.formState.errors.body]} />
              </Field>
              <Field>
                <Button type="submit" disabled={broadcast.isPending}>
                  {broadcast.isPending && <Spinner data-icon="inline-start" />}
                  Broadcast
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SendIcon className="size-4" />
            Send to a specific user
          </CardTitle>
          <CardDescription>Push a one-off notification to a single account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={sendForm.handleSubmit((values) => {
              if (!recipient) return
              sendToUser.mutate({ ...values, userId: recipient }, { onSuccess: () => sendForm.reset() })
            })}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="recipient">Recipient</FieldLabel>
                <Select value={recipient} onValueChange={(value) => setRecipient(value ?? '')}>
                  <SelectTrigger id="recipient" className="w-full">
                    <SelectValue placeholder="Choose a user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(users.data?.items ?? []).map((u) => (
                        <SelectItem key={u.userId} value={u.userId}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={!!sendForm.formState.errors.title}>
                <FieldLabel htmlFor="send-title">Title</FieldLabel>
                <Input id="send-title" {...sendForm.register('title')} />
                <FieldError errors={[sendForm.formState.errors.title]} />
              </Field>
              <Field data-invalid={!!sendForm.formState.errors.body}>
                <FieldLabel htmlFor="send-body">Message</FieldLabel>
                <Textarea id="send-body" rows={3} {...sendForm.register('body')} />
                <FieldError errors={[sendForm.formState.errors.body]} />
              </Field>
              <Field>
                <Button type="submit" disabled={sendToUser.isPending || !recipient}>
                  {sendToUser.isPending && <Spinner data-icon="inline-start" />}
                  Send
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
