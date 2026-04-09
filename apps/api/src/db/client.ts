import { parseApiEnv } from '@life-loop/config'
import { Pool } from 'pg'

const env = parseApiEnv(process.env)

let pool: Pool | undefined

export function getDatabasePool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
    })
  }

  return pool
}

export async function checkDatabaseConnection() {
  const databasePool = getDatabasePool()
  const result = await databasePool.query('select 1 as ok')
  return result.rows[0]?.ok === 1
}
