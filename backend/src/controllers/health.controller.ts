import type { Request, Response } from 'express'
import { config } from '../config/config.js'
import { checkDatabase } from '../database/database.js'

// Always 200, so a DB outage doesn't make the liveness probe restart the pod.
export async function getHealth(_req: Request, res: Response): Promise<void> {
  const database = (await checkDatabase()) ? 'ok' : 'error'
  res.json({
    status: 'ok',
    version: config.version,
    uptime: Math.round(process.uptime()),
    database,
  })
}
