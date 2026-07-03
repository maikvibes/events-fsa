import { api } from '@/services/http/client'

export function getHealth() {
  return api('GET', '/health', undefined, { auth: false })
}
