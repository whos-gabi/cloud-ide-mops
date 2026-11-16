export interface UserView {
  id: string
  email: string
  createdAt: string
}

export interface AuthCredentials {
  email: string
  password: string
}

export interface ApiErrorPayload {
  code?: string
  message?: string
  error?: string
  details?: Record<string, string[]>
}