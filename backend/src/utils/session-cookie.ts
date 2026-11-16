import type { Request, Response } from 'express'
import { config } from '../config/config.js'
import type { StartedSession } from '../services/session.service.js'

// HttpOnly: page scripts can't read it. Secure in production (HTTPS only).
const OPTIONS = { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/' } as const

export function setSessionCookie(res: Response, { token, expiresAt }: StartedSession): void {
  res.cookie(config.session.cookieName, token, { ...OPTIONS, maxAge: expiresAt.getTime() - Date.now() })
}

// The browser only removes it if the options match the ones it was set with.
export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.session.cookieName, OPTIONS)
}

export function readSessionToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[config.session.cookieName]
  return typeof token === 'string' && token ? token : undefined
}
