import { QueryFailedError } from 'typeorm'

// True if `err` is Postgres rejecting a row because of the given UNIQUE constraint.
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (!(err instanceof QueryFailedError)) return false
  const { code, constraint: name } = err.driverError as { code?: string; constraint?: string }
  return code === '23505' && name === constraint
}
