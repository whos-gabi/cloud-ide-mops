import type { Response } from 'express'
import { config } from '../config/config.js'
import type { StartedSession } from '../services/session.service.js'

// HttpOnly: page scripts can't read it. Secure in production (HTTPS only).
export function setSessionCookie(res: Response, { token, expiresAt }: StartedSession): void {
  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: expiresAt.getTime() - Date.now(),
  })
}
