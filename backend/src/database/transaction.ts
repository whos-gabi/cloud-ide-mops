import type { EntityManager } from 'typeorm'
import { dataSource } from './data-source.js'

// Runs `work` in a transaction, or joins the caller's if its `manager` is passed.
// Every query inside must go through `manager`.
export async function runInTransaction<T>(
  work: (manager: EntityManager) => Promise<T>,
  manager?: EntityManager,
): Promise<T> {
  if (manager?.queryRunner?.isTransactionActive) {
    return work(manager)
  }
  return dataSource.transaction(work)
}
