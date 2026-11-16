import 'reflect-metadata'
import { fileURLToPath } from 'node:url'
import { DataSource } from 'typeorm'
import { config } from '../config/config.js'

const here = (pattern: string) => fileURLToPath(new URL(pattern, import.meta.url))

// Also used by the TypeORM CLI, so keep it the only DataSource exported here.
export const dataSource = new DataSource({
  type: 'postgres',
  url: config.databaseUrl,
  entities: [here('../models/*.model.{ts,js}')],
  migrations: [here('./migrations/*.{ts,js}')],
  migrationsTableName: 'migrations',
  migrationsTransactionMode: 'each',
  synchronize: false, // schema changes only through migrations
  uuidExtension: 'pgcrypto', // gen_random_uuid()
  extra: { max: 10, connectionTimeoutMillis: 5_000 },
})
