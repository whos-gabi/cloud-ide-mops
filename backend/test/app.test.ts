import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app.js'

let server: Server
let baseUrl: string

before(() => {
  server = createApp().listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => {
  server.close()
})

const postJson = (body: string) =>
  fetch(`${baseUrl}/api/nope`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

describe('error responses', () => {
  it('returns JSON 404 for unknown /api routes', async () => {
    const res = await fetch(`${baseUrl}/api/nope`)
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: 'Not found' })
  })

  it('returns 400 for a malformed JSON body', async () => {
    const res = await postJson('{bad')
    assert.equal(res.status, 400)
    assert.deepEqual(await res.json(), { error: 'Invalid JSON body' })
  })

  it('returns 413 for a body over the size limit', async () => {
    const res = await postJson(JSON.stringify({ x: 'a'.repeat(200_000) }))
    assert.equal(res.status, 413)
  })
})
