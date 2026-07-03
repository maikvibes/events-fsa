import { initializeApp } from 'firebase/app'
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const fbApp = initializeApp(firebaseConfig)

// getMessaging() throws synchronously (not a rejected promise) in any context
// Firebase considers unsupported — no service worker API, or a non-secure
// origin (plain HTTP, not localhost). Calling it at module scope crashed the
// whole app before React could even mount. isSupported() is the sanctioned
// async check; cache the result so callers can just await this instead.
let cached: Messaging | null | undefined
export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (cached !== undefined) return cached
  cached = (await isSupported()) ? getMessaging(fbApp) : null
  return cached
}
