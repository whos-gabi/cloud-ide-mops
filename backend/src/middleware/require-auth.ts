import type { NextFunction, Request, Response } from 'express'
import { config } from '../config/config.js'
import { HttpError } from '../errors/http-error.js'
import { sessionService } from '../services/session.service.js'

// Put in front of any route that needs a logged-in user; sets req.user.
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.[config.session.cookieName]
  const user = typeof token === 'string' && token ? await sessionService.findUser(token) : null
  if (!user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Trebuie să te autentifici.')
  }
  req.user = user
  next()
}
