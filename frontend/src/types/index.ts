export type Role = 'user' | 'admin'

export interface EventItem {
  eventId: string
  userId: string
  title: string
  description: string
  date: string
  createdAt: string
  updatedAt: string
  isFollowing?: boolean
}

export interface AuthUser {
  userId: string
  email: string
  name: string
  role: Role
}

export interface AuthResponse extends AuthUser {
  accessToken: string
}

export interface NotificationLogEntry {
  id: string
  userId: string
  eventId: string | null
  title: string
  body: string
  status: string
  error: string | null
  createdAt: string
}

export interface AdminUserSummary {
  userId: string
  email: string
  name: string
  role: Role
  createdAt: string
}

export type BroadcastRunStatus = 'dispatched' | 'in_progress' | 'completed'

export interface BroadcastInstanceStat {
  instance: string
  batches: number
  sent: number
  failed: number
}

export interface BroadcastRunSummary {
  broadcastId: string
  title: string
  body: string
  requestedBy: string
  status: BroadcastRunStatus
  totalBatches: number | null
  totalTokens: number | null
  receivedBatches: number
  sent: number
  failed: number
  instanceCount: number
  requestedAt: string
  firstCompletionAt: string | null
  lastCompletionAt: string | null
  completedAt: string | null
}

export interface BroadcastRunDetail extends BroadcastRunSummary {
  instances: BroadcastInstanceStat[]
}

export interface PaginatedAdminUsers {
  items: AdminUserSummary[]
  total: number
  page: number
  pageSize: number
}
