import { env } from '@/config/env'

export interface ApiFieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  statusCode: number
  fieldErrors?: ApiFieldError[]

  constructor(message: string, statusCode: number, fieldErrors?: ApiFieldError[]) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.fieldErrors = fieldErrors
  }
}

function baseMessage(json: Record<string, unknown>, res: Response): string {
  const msg = json.message || json.error || res.statusText || `HTTP ${res.status}`
  return Array.isArray(msg) ? (msg as string[]).join('; ') : String(msg)
}

function buildErrorMessage(json: Record<string, unknown>, res: Response, fieldErrors?: ApiFieldError[]): string {
  const msg = baseMessage(json, res)
  if (fieldErrors && fieldErrors.length > 0) {
    const detail = fieldErrors
      .map(e => (e.field ? `${e.field}: ${e.message}` : e.message))
      .join('; ')
    return `${msg}: ${detail}`
  }
  if (res.status === 401) return `Session expired or invalid — please sign in again. (${msg})`
  if (res.status === 404) return `Not found — this endpoint may not exist yet. (${msg})`
  return `${msg} (HTTP ${res.status})`
}

export async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: object,
  opts: { auth?: boolean; token?: string | null } = {},
): Promise<T> {
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
    throw new ApiError(`network error reaching ${env.apiBaseUrl}${path}: ${msg}`, 0)
  }
  const text = await res.text()
  let json: Record<string, unknown>
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok) {
    const fieldErrors = Array.isArray(json.errors) ? (json.errors as ApiFieldError[]) : undefined
    const statusCode = typeof json.statusCode === 'number' ? json.statusCode : res.status
    throw new ApiError(buildErrorMessage(json, res, fieldErrors), statusCode, fieldErrors)
  }
  return ('data' in json ? json.data : json) as T
}
