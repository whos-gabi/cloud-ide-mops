import type { EntityManager } from 'typeorm'
import { dataSource } from '../database/data-source.js'
import { User } from '../models/user.model.js'

export type NewUser = Pick<User, 'email' | 'passwordHash'>

export class UserRepository {
  async create(data: NewUser, manager: EntityManager = dataSource.manager): Promise<User> {
    const users = manager.getRepository(User)
    return users.save(users.create(data))
  }
}

export const userRepository = new UserRepository()
