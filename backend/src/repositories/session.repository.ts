import { MoreThan, type EntityManager } from 'typeorm'
import { dataSource } from '../database/data-source.js'
import { Session } from '../models/session.model.js'

export type NewSession = Pick<Session, 'tokenHash' | 'userId' | 'expiresAt'>

export class SessionRepository {
  async create(data: NewSession, manager: EntityManager = dataSource.manager): Promise<Session> {
    const sessions = manager.getRepository(Session)
    return sessions.save(sessions.create(data))
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await dataSource.getRepository(Session).delete({ tokenHash })
  }

  // Unexpired session for this token hash, with its user.
  async findActive(tokenHash: string): Promise<Session | null> {
    return dataSource.getRepository(Session).findOne({
      where: { tokenHash, expiresAt: MoreThan(new Date()) },
      relations: { user: true },
    })
  }
}

export const sessionRepository = new SessionRepository()
