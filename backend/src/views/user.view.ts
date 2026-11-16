import type { User } from '../models/user.model.js'

// What the API returns for a user; never includes the password hash.
export interface UserView {
  id: string
  email: string
  createdAt: string
}

export function toUserView(user: User): UserView {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  }
}
