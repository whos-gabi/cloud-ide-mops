// US01 · Creare cont
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { dataSource } from '../src/database/data-source.js'
import { User } from '../src/models/user.model.js'
import { verifyPassword } from '../src/utils/password.js'
import { setupDatabase, teardownDatabase, testEmail } from './helpers/database.js'
import { startServer, type TestServer } from './helpers/server.js'

let server: TestServer
const register = (body: unknown) => server.postJson('/api/auth/register', body)
const users = () => dataSource.getRepository(User)

before(async () => {
  await setupDatabase()
  server = await startServer()
})

after(async () => {
  await server.close()
  await teardownDatabase()
})

describe('POST /api/auth/register', () => {
  it('creates the account and returns it without the password hash', async () => {
    const email = testEmail()
    const res = await register({ email, password: 'parola-buna' })
    assert.equal(res.status, 201)
    const { user } = await res.json()
    assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'email', 'id'])
    assert.equal(user.email, email)
    assert.ok(await users().findOneBy({ id: user.id }))
  })

  it('stores the password hashed, never in plain text', async () => {
    const email = testEmail()
    await register({ email, password: 'parola-buna' })
    const stored = await users().findOneOrFail({ where: { email }, select: { id: true, passwordHash: true } })
    assert.notEqual(stored.passwordHash, 'parola-buna')
    assert.ok(stored.passwordHash.startsWith('scrypt$'))
    assert.equal(await verifyPassword('parola-buna', stored.passwordHash), true)
  })

  it('stores the email trimmed and lowercased', async () => {
    const email = testEmail()
    const res = await register({ email: `  ${email.toUpperCase()} `, password: 'parola-buna' })
    assert.equal(res.status, 201)
    assert.equal((await res.json()).user.email, email)
  })

  it('does not log the user in (they go to the login page next)', async () => {
    const res = await register({ email: testEmail(), password: 'parola-buna' })
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('set-cookie'), null)
  })

  it('rejects an email that is already used, with a clear message', async () => {
    const email = testEmail()
    assert.equal((await register({ email, password: 'parola-buna' })).status, 201)
    const res = await register({ email: email.toUpperCase(), password: 'alta-parola' })
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), {
      error: 'Există deja un cont cu acest email.',
      code: 'EMAIL_TAKEN',
    })
  })

  it('rejects a password under 8 characters, with a clear message', async () => {
    const email = testEmail()
    const res = await register({ email, password: '1234567' })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'VALIDATION_ERROR')
    assert.equal(body.fields.password, 'Parola trebuie să aibă cel puțin 8 caractere.')
    assert.equal(await users().findOneBy({ email }), null)
  })

  it('accepts a password of exactly 8 characters', async () => {
    const res = await register({ email: testEmail(), password: '12345678' })
    assert.equal(res.status, 201)
  })

  it('rejects a password over 128 characters', async () => {
    const res = await register({ email: testEmail(), password: 'a'.repeat(129) })
    assert.equal(res.status, 400)
    assert.ok((await res.json()).fields.password)
  })

  it('rejects an invalid email', async () => {
    const res = await register({ email: 'not-an-email', password: 'parola-buna' })
    assert.equal(res.status, 400)
    assert.equal((await res.json()).fields.email, 'Adresa de email nu este validă.')
  })

  it('requires both email and password', async () => {
    const res = await register({})
    assert.equal(res.status, 400)
    const { fields } = await res.json()
    assert.ok(fields.email)
    assert.ok(fields.password)
  })

  it('rejects a body that is not an object', async () => {
    const res = await register('["a@b.ro", "parola-buna"]')
    assert.equal(res.status, 400)
    assert.equal((await res.json()).code, 'VALIDATION_ERROR')
  })

  it('creates only one account when the same email signs up twice at once', async () => {
    const email = testEmail()
    const statuses = (
      await Promise.all([
        register({ email, password: 'parola-buna' }),
        register({ email, password: 'parola-buna' }),
      ])
    ).map((res) => res.status)
    assert.deepEqual(statuses.sort(), [201, 409])
    assert.equal(await users().countBy({ email }), 1)
  })
})
