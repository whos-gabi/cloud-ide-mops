import type { Request, Response } from 'express'
import { authService } from '../services/auth.service.js'
import { registerSchema } from '../validators/auth.validator.js'
import { validate } from '../validators/validate.js'
import { toUserView } from '../views/user.view.js'

// POST /api/auth/register. Doesn't log the user in; the frontend sends them to the login page.
export async function register(req: Request, res: Response): Promise<void> {
  const input = validate(registerSchema, req.body)
  const user = await authService.register(input)
  res.status(201).json({ user: toUserView(user) })
}
