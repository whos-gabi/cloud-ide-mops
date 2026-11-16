import type { ErrorRequestHandler } from 'express'
import { HttpError } from '../errors/http-error.js'

// Express 5 also forwards errors thrown in async handlers here.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, ...(err.fields && { fields: err.fields }) })
    return
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }
  // Other client errors from body parsing, e.g. 413 body too large.
  if (err?.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: err.expose ? err.message : 'Bad request' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
