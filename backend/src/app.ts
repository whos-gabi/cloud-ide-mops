import express from 'express'

export function createApp() {
  const app = express()
  app.use(express.json())

  // Used by the frontend status page and by Kubernetes probes.
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: process.env.APP_VERSION ?? 'dev',
      uptime: Math.round(process.uptime()),
    })
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  return app
}
