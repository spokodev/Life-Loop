import type { DashboardSnapshot } from '@life-loop/shared-types'
import { Hono } from 'hono'

export const systemRoutes = new Hono()

systemRoutes.get('/status', (context) => {
  // TODO(mvp-deferred): Replace bootstrap snapshot data with DB-backed library, job, and restore-drill summaries.
  const snapshot: DashboardSnapshot = {
    health: {
      api: 'healthy',
      database: 'healthy',
      worker: 'degraded',
      restoreDrills: 'attention-required',
    },
    libraries: [],
    devices: [],
    storageTargets: [],
    jobs: [],
    restoreDrills: [],
  }

  return context.json(snapshot)
})
