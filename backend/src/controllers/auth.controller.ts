import type { Request, Response } from 'express'
import { authService } from '../services/auth.service.js'
import { setSessionCookie } from '../utils/session-cookie.js'
import { loginSchema, registerSchema } from '../validators/auth.validator.js'
import { validate } from '../validators/validate.js'
import { toUserView } from '../views/user.view.js'

// POST /api/auth/register. Doesn't log the user in; the frontend sends them to the login page.
export async function register(req: Request, res: Response): Promise<void> {
  const input = validate(registerSchema, req.body)
  const user = await authService.register(input)
  res.status(201).json({ user: toUserView(user) })
}

// POST /api/auth/login
export async function login(req: Request, res: Response): Promise<void> {
  const input = validate(loginSchema, req.body)
  const { user, session } = await authService.login(input)
  setSessionCookie(res, session)
  res.json({ user: toUserView(user) })
}

// GET /api/auth/me (behind requireAuth)
export function me(req: Request, res: Response): void {
  res.json({ user: toUserView(req.user!) })
}
