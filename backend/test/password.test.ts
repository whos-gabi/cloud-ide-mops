import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hashPassword, verifyPassword } from '../src/utils/password.js'

describe('password hashing', () => {
  it('produces a self-describing scrypt hash that does not contain the password', async () => {
    const hash = await hashPassword('correct horse')
    assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/)
    assert.ok(!hash.includes('correct horse'))
  })

  it('uses a new salt every time', async () => {
    assert.notEqual(await hashPassword('same password'), await hashPassword('same password'))
  })

  it('accepts the right password', async () => {
    const hash = await hashPassword('correct horse')
    assert.equal(await verifyPassword('correct horse', hash), true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse')
    assert.equal(await verifyPassword('Correct horse', hash), false)
    assert.equal(await verifyPassword('', hash), false)
  })

  it('returns false for a malformed hash instead of throwing', async () => {
    for (const bad of ['', 'plain-text', 'bcrypt$1$2$3$c2FsdA==$aGFzaA==', 'scrypt$abc$8$1$c2FsdA==$aGFzaA==', 'scrypt$16384$8$5$c2FsdA==$']) {
      assert.equal(await verifyPassword('anything', bad), false, `hash: ${bad}`)
    }
  })
})
