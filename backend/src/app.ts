import cookieParser from 'cookie-parser'
import express from 'express'
import { errorHandler } from './middleware/error-handler.js'
import { notFound } from './middleware/not-found.js'
import { apiRouter } from './routes/index.js'

export function createApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())

  app.use('/api', apiRouter)
  app.use('/api', notFound)

  app.use(errorHandler)

  return app
}
