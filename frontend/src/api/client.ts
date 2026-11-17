import type { ApiErrorPayload } from '../types/auth'

export class ApiError extends Error {
  status: number
  code?: string
  fields?: Record<string, string>

  constructor(status: number, payload: ApiErrorPayload | null) {
    super(payload?.message || payload?.error || 'A apărut o eroare neașteptată.')
    this.status = status
    this.code = payload?.codea
    this.fields = payload?.fields
  }
}

// Called when the server says the session is gone (expired, or logged out in
// another tab), so the app can send the user to the login page.
let onUnauthenticated: (() => void) | null = null

export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null

  if (!response.ok) {
    const error = new ApiError(response.status, payload)
    // Not every 401: a failed login (INVALID_CREDENTIALS) stays on its form.
    if (error.code === 'UNAUTHENTICATED') onUnauthenticated?.()
    throw error
  }

  return payload as T
}