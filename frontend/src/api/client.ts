import type { ApiErrorPayload } from '../types/auth'

export class ApiError extends Error {
  status: number
  code?: string
  fields?: Record<string, string>

  constructor(status: number, payload: ApiErrorPayload | null) {
    super(payload?.message || payload?.error || 'A apărut o eroare neașteptată.')
    this.status = status
    this.code = payload?.code
    this.fields = payload?.fields
  }
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
    throw new ApiError(response.status, payload)
  }

  return payload as T
}