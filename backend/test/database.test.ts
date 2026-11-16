// Needs Postgres: docker compose up -d db
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { QueryFailedError } from 'typeorm'
import { dataSource } from '../src/database/data-source.js'
import { runMigrations } from '../src/database/database.js'
import { runInTransaction } from '../src/database/transaction.js'
import { User } from '../src/models/user.model.js'
import { setupDatabase, teardownDatabase, testEmail } from './helpers/database.js'
import { startServer } from './helpers/server.js'

const users = () => dataSource.getRepository(User)
const newUser = (email = testEmail()) => users().create({ email, passwordHash: 'scrypt$test' })

function dbError(err: unknown) {
  assert.ok(err instanceof QueryFailedError, `expected a QueryFailedError, got ${err}`)
  const { code, constraint } = err.driverError as { code: string; constraint?: string }
  return { code, constraint }
}

before(setupDatabase)
after(teardownDatabase)

describe('migrations', () => {
  it('has nothing left to run after startup', async () => {
    assert.deepEqual(await runMigrations(), [])
    assert.equal(await dataSource.showMigrations(), false)
  })
})

describe('users table', () => {
  it('generates the id and timestamps', async () => {
    const user = await users().save(newUser())
    assert.match(user.id, /^[0-9a-f-]{36}$/)
    assert.ok(user.createdAt instanceof Date)
    assert.ok(user.updatedAt instanceof Date)
  })

  it('rejects an email that is already used', async () => {
    const email = testEmail()
    await users().save(newUser(email))
    await assert.rejects(users().save(newUser(email)), (err) => {
      assert.deepEqual(dbError(err), { code: '23505', constraint: 'UQ_users_email' })
      return true
    })
  })

  it('rejects an email that is not lowercase', async () => {
    await assert.rejects(users().save(newUser(testEmail().toUpperCase())), (err) => {
      assert.deepEqual(dbError(err), { code: '23514', constraint: 'CHK_users_email_lowercase' })
      return true
    })
  })

  it('leaves the password hash out of queries unless asked for', async () => {
    const { id } = await users().save(newUser())
    const plain = await users().findOneByOrFail({ id })
    assert.equal(plain.passwordHash, undefined)
    const withHash = await users().findOneOrFail({
      where: { id },
      select: { id: true, passwordHash: true },
    })
    assert.equal(withHash.passwordHash, 'scrypt$test')
  })

  it('bumps updatedAt on save', async () => {
    const { id } = await users().save(newUser())
    await dataSource.query(`UPDATE "users" SET "updatedAt" = now() - interval '1 hour' WHERE "id" = $1`, [id])
    const user = await users().findOneByOrFail({ id })
    const before = user.updatedAt
    user.email = testEmail()
    const saved = await users().save(user)
    assert.ok(saved.updatedAt.getTime() - before.getTime() > 30 * 60_000)
  })
})

describe('runInTransaction', () => {
  it('commits when the work succeeds', async () => {
    const email = testEmail()
    await runInTransaction((manager) => manager.save(newUser(email)))
    assert.ok(await users().findOneBy({ email }))
  })

  it('rolls back everything when the work throws', async () => {
    const email = testEmail()
    await assert.rejects(
      runInTransaction(async (manager) => {
        await manager.save(newUser(email))
        throw new Error('boom')
      }),
      /boom/,
    )
    assert.equal(await users().findOneBy({ email }), null)
  })

  it('joins the caller’s transaction when given its manager', async () => {
    const outer = testEmail()
    const inner = testEmail()
    await assert.rejects(
      runInTransaction(async (manager) => {
        await manager.save(newUser(outer))
        await runInTransaction(async (joined) => {
          assert.equal(joined, manager)
          await joined.save(newUser(inner))
        }, manager)
        throw new Error('outer fails after inner finished')
      }),
      /outer fails/,
    )
    // Rolled back together with the outer transaction.
    assert.equal(await users().findOneBy({ email: inner }), null)
    assert.equal(await users().findOneBy({ email: outer }), null)
  })
})

describe('GET /api/health', () => {
  it('reports the database as ok', async () => {
    const server = await startServer()
    try {
      const res = await fetch(`${server.url}/api/health`)
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.status, 'ok')
      assert.equal(body.database, 'ok')
    } finally {
      await server.close()
    }
  })
})
