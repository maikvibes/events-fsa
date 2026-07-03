import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { EventItem } from '@/types'

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  date: z.string().min(1, 'Date is required'),
})

export type EventFormValues = z.infer<typeof schema>

function toDateTimeLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface EventFormProps {
  event?: EventItem
  submitLabel: string
  pending?: boolean
  onSubmit: (values: EventFormValues) => void
}

export function EventForm({ event, submitLabel, pending, onSubmit }: EventFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: event
      ? { title: event.title, description: event.description, date: toDateTimeLocal(event.date) }
      : { title: '', description: '', date: '' },
  })

  function submit(values: EventFormValues) {
    onSubmit({ ...values, date: new Date(values.date).toISOString() })
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <Input id="title" aria-invalid={!!errors.title} {...register('title')} />
          <FieldError errors={[errors.title]} />
        </Field>
        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea id="description" rows={5} aria-invalid={!!errors.description} {...register('description')} />
          <FieldError errors={[errors.description]} />
        </Field>
        <Field data-invalid={!!errors.date}>
          <FieldLabel htmlFor="date">Date &amp; time</FieldLabel>
          <Input id="date" type="datetime-local" aria-invalid={!!errors.date} {...register('date')} />
          <FieldError errors={[errors.date]} />
        </Field>
        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {submitLabel}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
