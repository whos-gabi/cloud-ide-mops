import type { EntityManager } from 'typeorm'
import { dataSource } from '../database/data-source.js'
import { User } from '../models/user.model.js'

export type NewUser = Pick<User, 'email' | 'passwordHash'>

export class UserRepository {
  async create(data: NewUser, manager: EntityManager = dataSource.manager): Promise<User> {
    const users = manager.getRepository(User)
    return users.save(users.create(data))
  }

  // The only query that loads passwordHash; use it just to check a password.
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return dataSource.getRepository(User).findOne({
      where: { email },
      select: { id: true, email: true, passwordHash: true, createdAt: true, updatedAt: true },
    })
  }
}

export const userRepository = new UserRepository()
