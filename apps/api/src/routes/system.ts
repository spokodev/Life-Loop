import type { DashboardSnapshot } from '@life-loop/shared-types'
import { Hono } from 'hono'

import { getDashboardSnapshot } from '../db/dashboard'

export const systemRoutes = new Hono()

systemRoutes.get('/status', async (context) => {
  const snapshot: DashboardSnapshot = await getDashboardSnapshot()

  return context.json(snapshot)
})
