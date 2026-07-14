import { api } from '@/services/http/client'
import type {
  AdminUserSummary,
  PaginatedAdminUsers,
  PaginatedNotifications,
  Role,
  SeedJobProgress,
} from '@/types'

export interface ListUsersParams {
  page?: number
  pageSize?: number
  search?: string
  role?: Role
  createdFrom?: string
  createdTo?: string
  sortBy?: 'name' | 'email' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

export interface ListNotificationsParams {
  page?: number
  pageSize?: number
  search?: string
  status?: 'sent' | 'failed'
  userId?: string
  eventId?: string
  createdFrom?: string
  createdTo?: string
  sortOrder?: 'asc' | 'desc'
}

function buildQuery(params: object): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export function listUsers(token: string | null, params: ListUsersParams = {}) {
  return api<PaginatedAdminUsers>('GET', `/admin/users${buildQuery(params)}`, undefined, { token })
}

export function updateUserRole(userId: string, role: Role, token: string | null) {
  return api<AdminUserSummary>('PATCH', `/admin/users/${userId}/role`, { role }, { token })
}

export function deleteUser(userId: string, token: string | null) {
  return api<void>('DELETE', `/admin/users/${userId}`, undefined, { token })
}

export function listAllNotifications(token: string | null, params: ListNotificationsParams = {}) {
  return api<PaginatedNotifications>('GET', `/admin/notifications${buildQuery(params)}`, undefined, { token })
}

export function startSeed(count: number, fresh: boolean, token: string | null) {
  return api<{ jobId: string; count: number }>('POST', '/admin/seed', { count, fresh }, { token })
}

export function getSeedProgress(jobId: string, token: string | null) {
  return api<SeedJobProgress | null>('GET', `/admin/seed/${jobId}`, undefined, { token })
}
