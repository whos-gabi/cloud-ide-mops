import type { z } from 'zod'
import { HttpError } from '../errors/http-error.js'

// Parses a request body, or throws a 400 with one message per invalid field.
export function validate<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data ?? {})
  if (result.success) return result.data

  const fields: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.join('.')
    if (field && !fields[field]) fields[field] = issue.message
  }
  throw new HttpError(400, 'VALIDATION_ERROR', 'Datele trimise nu sunt valide.', fields)
}
