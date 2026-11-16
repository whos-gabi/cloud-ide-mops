import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { startServer, type TestServer } from './helpers/server.js'

let server: TestServer

before(async () => {
  server = await startServer()
})

after(() => server.close())

describe('error responses', () => {
  it('returns JSON 404 for unknown /api routes', async () => {
    const res = await fetch(`${server.url}/api/nope`)
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: 'Not found' })
  })

  it('returns 400 for a malformed JSON body', async () => {
    const res = await server.postJson('/api/nope', '{bad')
    assert.equal(res.status, 400)
    assert.deepEqual(await res.json(), { error: 'Invalid JSON body' })
  })

  it('returns 413 for a body over the size limit', async () => {
    const res = await server.postJson('/api/nope', { x: 'a'.repeat(200_000) })
    assert.equal(res.status, 413)
  })
})
