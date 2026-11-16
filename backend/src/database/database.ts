import type { Migration } from 'typeorm'
import { dataSource } from './data-source.js'

// Makes concurrent backends take turns running migrations.
const MIGRATION_LOCK_ID = 7_231_001

// Retries: on a fresh deploy Postgres may not be up yet.
export async function connectDatabase(timeoutMs = 60_000, intervalMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await dataSource.initialize()
      return
    } catch (err) {
      if (Date.now() >= deadline) {
        throw new Error(`database not reachable after ${timeoutMs / 1000}s: ${(err as Error).message}`, {
          cause: err,
        })
      }
      console.log('waiting for database...')
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
}

export async function runMigrations(): Promise<Migration[]> {
  const lock = dataSource.createQueryRunner()
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
    return await dataSource.runMigrations()
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {})
    await lock.release()
  }
}

// Bounded, so a hung database can't stall the liveness probe.
export async function checkDatabase(timeoutMs = 500): Promise<boolean> {
  if (!dataSource.isInitialized) return false
  const query = dataSource.query('SELECT 1').then(
    () => true,
    () => false,
  )
  const timeout = new Promise<boolean>((resolve) => setTimeout(resolve, timeoutMs, false).unref())
  return Promise.race([query, timeout])
}

export async function closeDatabase(): Promise<void> {
  if (dataSource.isInitialized) await dataSource.destroy()
}
