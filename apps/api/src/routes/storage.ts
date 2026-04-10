import { Hono } from 'hono'

import { getStorageReadiness } from '../db/storage'

export const storageRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

storageRoutes.get('/storage/readiness', async (context) => {
  const readiness = await getStorageReadiness()
  return context.json(readiness)
})
