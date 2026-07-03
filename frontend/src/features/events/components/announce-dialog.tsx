import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MegaphoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAnnounceEvent } from '@/features/events/hooks'

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  body: z.string().min(1, 'Message is required').max(1000),
})

type FormValues = z.infer<typeof schema>

export function AnnounceDialog({ eventId }: { eventId: string }) {
  const announce = useAnnounceEvent()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) reset()
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <MegaphoneIcon data-icon="inline-start" />
        Announce
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send an announcement</DialogTitle>
          <DialogDescription>Push a notification to everyone following this event.</DialogDescription>
        </DialogHeader>
        <form
          id="announce-form"
          onSubmit={handleSubmit((values) => {
            announce.mutate(
              { eventId, payload: values },
              {
                onSuccess: () => reset(),
              },
            )
          })}
          noValidate
        >
          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="announce-title">Title</FieldLabel>
              <Input id="announce-title" aria-invalid={!!errors.title} {...register('title')} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={!!errors.body}>
              <FieldLabel htmlFor="announce-body">Message</FieldLabel>
              <Textarea id="announce-body" rows={4} aria-invalid={!!errors.body} {...register('body')} />
              <FieldError errors={[errors.body]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" form="announce-form" disabled={announce.isPending}>
            {announce.isPending && <Spinner data-icon="inline-start" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
