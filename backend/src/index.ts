import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)

const server = createApp().listen(port, () => {
  console.log(`backend listening on :${port}`)
})

// Let Kubernetes stop the pod cleanly during rollouts.
process.on('SIGTERM', () => server.close(() => process.exit(0)))
