import { isUniqueViolation } from '../database/errors.js'
import { HttpError } from '../errors/http-error.js'
import type { User } from '../models/user.model.js'
import { userRepository } from '../repositories/user.repository.js'
import { hashPassword } from '../utils/password.js'
import type { RegisterInput } from '../validators/auth.validator.js'

export class AuthService {
  // US01. Relies on the unique constraint, so two simultaneous sign-ups can't both succeed.
  async register({ email, password }: RegisterInput): Promise<User> {
    const passwordHash = await hashPassword(password)
    try {
      return await userRepository.create({ email, passwordHash })
    } catch (err) {
      if (isUniqueViolation(err, 'UQ_users_email')) {
        throw new HttpError(409, 'EMAIL_TAKEN', 'Există deja un cont cu acest email.')
      }
      throw err
    }
  }
}

export const authService = new AuthService()
