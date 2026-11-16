import { createHash, randomBytes } from 'node:crypto'

// The value of the session cookie: 32 random bytes.
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

// What the database stores instead of the token.
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
