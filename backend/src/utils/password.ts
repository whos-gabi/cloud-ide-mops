import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// OWASP-recommended scrypt settings; uses 16 MiB of memory per hash.
const PARAMS = { N: 2 ** 14, r: 8, p: 5 }
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const MAX_MEMORY = 64 * 1024 * 1024

function derive(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { ...options, maxmem: MAX_MEMORY }, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

// Format: scrypt$N$r$p$salt$hash (base64).
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const hash = await derive(password, salt, KEY_LENGTH, PARAMS)
  const { N, r, p } = PARAMS
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

// Reads the parameters from the stored hash, so they can be raised later.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt' || !parts[4] || !parts[5]) return false
  const [, N, r, p, salt, hash] = parts
  const expected = Buffer.from(hash, 'base64')
  try {
    const actual = await derive(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
