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
  createdAt: string
}
