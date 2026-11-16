import { apiRequest } from './client'
import type { AuthCredentials, UserView } from '../types/auth'

export const authApi = {
  register: (input: AuthCredentials) =>
    apiRequest<{ user: UserView }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: AuthCredentials) =>
    apiRequest<{ user: UserView }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  me: () => apiRequest<{ user: UserView }>('/auth/me'),

  logout: () =>
    apiRequest<void>('/auth/logout', {
      method: 'POST',
    }),
}