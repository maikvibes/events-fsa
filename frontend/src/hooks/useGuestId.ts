import { useState } from 'react'

const GUEST_ID_KEY = 'guestId'

function loadOrCreateGuestId(): string {
  const existing = localStorage.getItem(GUEST_ID_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(GUEST_ID_KEY, created)
  return created
}

export function useGuestId(): string {
  const [guestId] = useState(loadOrCreateGuestId)
  return guestId
}
