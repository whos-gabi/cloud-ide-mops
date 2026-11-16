// US02 · Autentificare
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { dataSource } from '../src/database/data-source.js'
import { setupDatabase, teardownDatabase, testEmail } from './helpers/database.js'
import { getSetCookie, startServer, type TestServer } from './helpers/server.js'

const PASSWORD = 'parola-buna'

let server: TestServer
const login = (body: unknown) => server.postJson('/api/auth/login', body)

async function createAccount(email = testEmail()): Promise<string> {
  const res = await server.postJson('/api/auth/register', { email, password: PASSWORD })
  assert.equal(res.status, 201)
  return email
}

before(async () => {
  await setupDatabase()
  server = await startServer()
})

after(async () => {
  await server.close()
  await teardownDatabase()
})

describe('POST /api/auth/login', () => {
  it('logs in with the right email and password and returns the user', async () => {
    const email = await createAccount()
    const res = await login({ email, password: PASSWORD })
    assert.equal(res.status, 200)
    const { user } = await res.json()
    assert.equal(user.email, email)
    assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'email', 'id'])
  })

  it('accepts the email in any letter case and with spaces around it', async () => {
    const email = await createAccount()
    const res = await login({ email: `  ${email.toUpperCase()} `, password: PASSWORD })
    assert.equal(res.status, 200)
  })

  describe('with wrong credentials', () => {
    const INVALID = { error: 'Email sau parolă greșită.', code: 'INVALID_CREDENTIALS' }

    it('rejects a wrong password without saying which field is wrong', async () => {
      const email = await createAccount()
      const res = await login({ email, password: 'parola-gresita' })
      assert.equal(res.status, 401)
      assert.deepEqual(await res.json(), INVALID)
    })

    it('answers an unknown email exactly like a wrong password', async () => {
      const res = await login({ email: testEmail(), password: PASSWORD })
      assert.equal(res.status, 401)
      assert.deepEqual(await res.json(), INVALID)
    })

    it('takes about as long for an unknown email as for a wrong password', async () => {
      const email = await createAccount()
      const time = async (body: unknown) => {
        const start = performance.now()
        assert.equal((await login(body)).status, 401)
        return performance.now() - start
      }
      const wrongPassword = await time({ email, password: 'parola-gresita' })
      const unknownEmail = await time({ email: testEmail(), password: PASSWORD })
      // Otherwise response times would reveal which emails have an account.
      assert.ok(unknownEmail > wrongPassword / 2, `unknown ${unknownEmail}ms vs wrong ${wrongPassword}ms`)
    })

    it('answers a malformed email the same way, not with a field error', async () => {
      const res = await login({ email: 'not-an-email', password: PASSWORD })
      assert.equal(res.status, 401)
      assert.deepEqual(await res.json(), INVALID)
    })
  })

  describe('session', () => {
    it('sets an HttpOnly session cookie for the whole site', async () => {
      const res = await login({ email: await createAccount(), password: PASSWORD })
      const cookie = getSetCookie(res, 'sid')
      assert.ok(cookie, 'no sid cookie')
      assert.ok(cookie.value.length >= 40, 'token too short to be unguessable')
      for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/']) {
        assert.ok(cookie.attributes.includes(attribute), `missing ${attribute}`)
      }
      assert.ok(cookie.attributes.some((a) => a.startsWith('Max-Age=')), 'missing Max-Age')
    })

    it('stores only a hash of the token, linked to the user', async () => {
      const res = await login({ email: await createAccount(), password: PASSWORD })
      const { user } = await res.json()
      const token = getSetCookie(res, 'sid')!.value
      const rows = await dataSource.query(`SELECT "userId", "tokenHash" FROM "sessions" WHERE "userId" = $1`, [user.id])
      assert.equal(rows.length, 1)
      assert.equal(rows[0].tokenHash, createHash('sha256').update(token).digest('hex'))
    })

    it('gives every login its own token', async () => {
      const email = await createAccount()
      const first = getSetCookie(await login({ email, password: PASSWORD }), 'sid')!.value
      const second = getSetCookie(await login({ email, password: PASSWORD }), 'sid')!.value
      assert.notEqual(first, second)
    })

    it('does not set a cookie when the login fails', async () => {
      const res = await login({ email: await createAccount(), password: 'parola-gresita' })
      assert.equal(res.status, 401)
      assert.equal(getSetCookie(res, 'sid'), null)
    })
  })

  it('asks for both fields when they are missing', async () => {
    const res = await login({})
    assert.equal(res.status, 400)
    assert.deepEqual((await res.json()).fields, {
      email: 'Introdu adresa de email.',
      password: 'Introdu parola.',
    })
  })
})

// Protected routes answer 401, and the frontend sends the user to the login page.
describe('GET /api/auth/me (protected)', () => {
  const UNAUTHENTICATED = { error: 'Trebuie să te autentifici.', code: 'UNAUTHENTICATED' }
  const me = (token?: string) =>
    fetch(`${server.url}/api/auth/me`, { headers: token ? { Cookie: `sid=${token}` } : {} })

  async function loggedIn(): Promise<{ token: string; user: { id: string; email: string } }> {
    const res = await login({ email: await createAccount(), password: PASSWORD })
    return { token: getSetCookie(res, 'sid')!.value, user: (await res.json()).user }
  }

  it('returns the logged-in user', async () => {
    const { token, user } = await loggedIn()
    const res = await me(token)
    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).user, user)
  })

  it('rejects a request without a session cookie', async () => {
    const res = await me()
    assert.equal(res.status, 401)
    assert.deepEqual(await res.json(), UNAUTHENTICATED)
  })

  it('rejects a token that was never issued', async () => {
    const res = await me('made-up-token')
    assert.equal(res.status, 401)
    assert.deepEqual(await res.json(), UNAUTHENTICATED)
  })

  it('rejects an expired session', async () => {
    const { token, user } = await loggedIn()
    await dataSource.query(`UPDATE "sessions" SET "expiresAt" = now() - interval '1 minute' WHERE "userId" = $1`, [user.id])
    const res = await me(token)
    assert.equal(res.status, 401)
    assert.deepEqual(await res.json(), UNAUTHENTICATED)
  })
})
