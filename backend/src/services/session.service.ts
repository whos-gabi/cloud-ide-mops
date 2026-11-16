import { config } from '../config/config.js'
import type { User } from '../models/user.model.js'
import { sessionRepository } from '../repositories/session.repository.js'
import { generateSessionToken, hashSessionToken } from '../utils/session-token.js'

export interface StartedSession {
  token: string
  expiresAt: Date
}

export class SessionService {
  async start(userId: string): Promise<StartedSession> {
    const token = generateSessionToken()
    const expiresAt = new Date(Date.now() + config.session.ttlMs)
    await sessionRepository.create({ tokenHash: hashSessionToken(token), userId, expiresAt })
    return { token, expiresAt }
  }

  async findUser(token: string): Promise<User | null> {
    const session = await sessionRepository.findActive(hashSessionToken(token))
    return session?.user ?? null
  }
}

export const sessionService = new SessionService()
