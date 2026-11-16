import { isUniqueViolation } from '../database/errors.js'
import { HttpError } from '../errors/http-error.js'
import type { User } from '../models/user.model.js'
import { userRepository } from '../repositories/user.repository.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import type { LoginInput, RegisterInput } from '../validators/auth.validator.js'
import { sessionService, type StartedSession } from './session.service.js'

// Checked when the email doesn't exist, so that response takes as long as a wrong password.
let dummyHash: Promise<string> | undefined
const getDummyHash = () => (dummyHash ??= hashPassword('no-such-user'))

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

  // US02. Same error for an unknown email and a wrong password.
  async login({ email, password }: LoginInput): Promise<{ user: User; session: StartedSession }> {
    const user = await userRepository.findByEmailWithPassword(email)
    const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()))
    if (!user || !valid) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email sau parolă greșită.')
    }
    return { user, session: await sessionService.start(user.id) }
  }
}

export const authService = new AuthService()
