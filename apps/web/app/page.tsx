import type { DashboardSnapshot } from '@life-loop/shared-types'

import { DashboardScreen } from '../components/dashboard-screen'
import { webEnv } from '../lib/env'

const fallbackSnapshot: DashboardSnapshot = {
  health: {
    api: 'degraded',
    database: 'degraded',
    worker: 'degraded',
    restoreDrills: 'attention-required',
  },
  devices: [],
  libraries: [],
  storageTargets: [],
  jobs: [],
  restoreDrills: [],
}

async function getSnapshot() {
  try {
    const response = await fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/status`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Status endpoint returned ${response.status}`)
    }

    return {
      snapshot: (await response.json()) as DashboardSnapshot,
      usingFallback: false,
    }
  } catch {
    return {
      snapshot: fallbackSnapshot,
      usingFallback: true,
    }
  }
}

export default async function HomePage() {
  const { snapshot, usingFallback } = await getSnapshot()

  return (
    <DashboardScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      snapshot={snapshot}
      usingFallback={usingFallback}
    />
  )
}
