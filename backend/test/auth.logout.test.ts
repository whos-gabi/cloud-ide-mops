// US03 · Deconectare
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { dataSource } from '../src/database/data-source.js'
import { hashSessionToken } from '../src/utils/session-token.js'
import { setupDatabase, teardownDatabase, testEmail } from './helpers/database.js'
import { getSetCookie, startServer, type TestServer } from './helpers/server.js'

const PASSWORD = 'parola-buna'

let server: TestServer

const withSession = (token?: string): RequestInit => ({ headers: token ? { Cookie: `sid=${token}` } : {} })
const me = (token?: string) => fetch(`${server.url}/api/auth/me`, withSession(token))
const logout = (token?: string) => fetch(`${server.url}/api/auth/logout`, { method: 'POST', ...withSession(token) })

async function loginToken(email: string): Promise<string> {
  const res = await server.postJson('/api/auth/login', { email, password: PASSWORD })
  assert.equal(res.status, 200)
  return getSetCookie(res, 'sid')!.value
}

async function loggedIn(): Promise<string> {
  const email = testEmail()
  assert.equal((await server.postJson('/api/auth/register', { email, password: PASSWORD })).status, 201)
  return loginToken(email)
}

before(async () => {
  await setupDatabase()
  server = await startServer()
})

after(async () => {
  await server.close()
  await teardownDatabase()
})

describe('POST /api/auth/logout', () => {
  it('ends the session: the same token no longer opens protected routes', async () => {
    const token = await loggedIn()
    assert.equal((await me(token)).status, 200)

    const res = await logout(token)

    assert.equal(res.status, 204)
    assert.equal((await me(token)).status, 401)
  })

  it('tells the browser to delete the session cookie', async () => {
    const res = await logout(await loggedIn())
    const cookie = getSetCookie(res, 'sid')
    assert.ok(cookie, 'no Set-Cookie for sid')
    assert.equal(cookie.value, '')
    const expires = cookie.attributes.find((a) => a.startsWith('Expires='))
    assert.ok(expires && new Date(expires.slice('Expires='.length)) < new Date(), 'cookie not expired')
    for (const attribute of ['Path=/', 'HttpOnly', 'SameSite=Lax']) {
      assert.ok(cookie.attributes.includes(attribute), `missing ${attribute}`)
    }
  })

  it('succeeds without a session cookie, so logging out never shows an error', async () => {
    const res = await logout()
    assert.equal(res.status, 204)
    assert.equal(getSetCookie(res, 'sid')?.value, '')
  })

  it('succeeds twice in a row with the same token (e.g. a double click)', async () => {
    const token = await loggedIn()
    assert.equal((await logout(token)).status, 204)
    assert.equal((await logout(token)).status, 204)
  })

  it('keeps the user logged in on their other devices', async () => {
    const email = testEmail()
    assert.equal((await server.postJson('/api/auth/register', { email, password: PASSWORD })).status, 201)
    const laptop = await loginToken(email)
    const phone = await loginToken(email)

    await logout(laptop)

    assert.equal((await me(laptop)).status, 401)
    assert.equal((await me(phone)).status, 200)
  })

  it('deletes the session from the database, so a copied cookie is useless', async () => {
    const token = await loggedIn()
    await logout(token)
    const rows = await dataSource.query(`SELECT 1 FROM "sessions" WHERE "tokenHash" = $1`, [hashSessionToken(token)])
    assert.equal(rows.length, 0)
  })
})

// The Back button must not bring protected data back from the browser cache after logout.
describe('protected responses', () => {
  it('are never stored by the browser', async () => {
    const res = await me(await loggedIn())
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  it('are not stored when refused either', async () => {
    const res = await me()
    assert.equal(res.status, 401)
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })
})
