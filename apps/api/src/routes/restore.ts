import { Hono } from 'hono'

import { getRestoreReadiness } from '../db/assets'

export const restoreRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

restoreRoutes.get('/restore/readiness', async (context) => {
  const readiness = await getRestoreReadiness()
  return context.json(readiness)
})
