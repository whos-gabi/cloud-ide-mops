import { randomUUID } from 'node:crypto'
import { Like } from 'typeorm'
import { dataSource } from '../../src/database/data-source.js'
import { closeDatabase, connectDatabase, runMigrations } from '../../src/database/database.js'
import { User } from '../../src/models/user.model.js'

// Every test account uses this pattern, so teardown can remove them all.
export const testEmail = () => `test-${randomUUID()}@example.com`

export async function setupDatabase(): Promise<void> {
  await connectDatabase(5_000)
  await runMigrations()
}

export async function teardownDatabase(): Promise<void> {
  await dataSource.getRepository(User).delete({ email: Like('test-%@example.com') })
  await closeDatabase()
}
