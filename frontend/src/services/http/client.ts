import { env } from '@/config/env'

export async function api(
  method: string,
  path: string,
  body?: object,
  opts: { auth?: boolean; token?: string | null } = {},
): Promise<Record<string, unknown>> {
  const { auth = true, token } = opts
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth && token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(env.apiBaseUrl + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`network error reaching ${env.apiBaseUrl}${path}: ${msg}`)
  }
  const text = await res.text()
  let json: Record<string, unknown>
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok) {
    const msg = json.message || json.error || res.statusText || `HTTP ${res.status}`
    throw new Error(Array.isArray(msg) ? (msg as string[]).join('; ') : String(msg))
  }
  return ('data' in json ? json.data : json) as Record<string, unknown>
}
