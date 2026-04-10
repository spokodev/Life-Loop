import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createLogger, parseApiEnv } from '@life-loop/config'

import { getDatabasePool } from './client'

const logger = createLogger('api-migrations', parseApiEnv(process.env).LOG_LEVEL)

async function run() {
  const pool = getDatabasePool()
  const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const migrationFile of migrationFiles) {
    const migrationPath = path.join(migrationsDirectory, migrationFile)
    const sql = await readFile(migrationPath, 'utf8')

    logger.info('Running schema migration', { migrationPath })
    await pool.query(sql)
  }

  logger.info('Schema migration complete', { count: migrationFiles.length })
  await pool.end()
}

run().catch((error: unknown) => {
  logger.error('Schema migration failed', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  process.exit(1)
})
