import { createApp } from './app.js'
import { config } from './config/config.js'
import { closeDatabase, connectDatabase, runMigrations } from './database/database.js'

await connectDatabase()
const applied = await runMigrations()
if (applied.length) console.log(`migrations applied: ${applied.map((m) => m.name).join(', ')}`)

const server = createApp().listen(config.port, () => {
  console.log(`backend listening on :${config.port}`)
})

// Let Kubernetes stop the pod cleanly during rollouts.
process.on('SIGTERM', () => {
  server.close(() => {
    closeDatabase().finally(() => process.exit(0))
  })
})
