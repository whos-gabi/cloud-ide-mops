import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../errors/http-error.js'
import { sessionService } from '../services/session.service.js'
import { readSessionToken } from '../utils/session-cookie.js'

// Put in front of any route that needs a logged-in user; sets req.user.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // So the browser's Back button can't show protected data after logout (US03).
  res.set('Cache-Control', 'no-store')
  const token = readSessionToken(req)
  const user = token ? await sessionService.findUser(token) : null
  if (!user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Trebuie să te autentifici.')
  }
  req.user = user
  next()
}
