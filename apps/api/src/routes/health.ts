import { Hono } from 'hono'

import { checkDatabaseConnection } from '../db/client'

export const healthRoutes = new Hono()

healthRoutes.get('/live', (context) =>
  context.json({
    service: 'api',
    status: 'ok',
    timestamp: new Date().toISOString(),
  }),
)

healthRoutes.get('/ready', async (context) => {
  const databaseReady = await checkDatabaseConnection()

  return context.json(
    {
      service: 'api',
      status: databaseReady ? 'ready' : 'degraded',
      checks: {
        database: databaseReady ? 'ok' : 'degraded',
      },
      timestamp: new Date().toISOString(),
    },
    databaseReady ? 200 : 503,
  )
})
