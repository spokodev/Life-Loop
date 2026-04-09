import type { DashboardSnapshot } from '@life-loop/shared-types'

import { DashboardScreen } from '../components/dashboard-screen'
import { webEnv } from '../lib/env'

const snapshot: DashboardSnapshot = {
  health: {
    api: 'healthy',
    database: 'healthy',
    worker: 'degraded',
    restoreDrills: 'attention-required',
  },
  libraries: [
    {
      id: 'library-demo',
      slug: 'personal-archive',
      name: 'Personal Archive',
      description: 'Primary single-user MVP library.',
      assetCount: 0,
    },
  ],
  devices: [],
  storageTargets: [
    {
      id: 'target-primary',
      libraryId: 'library-demo',
      name: 'Archive SSD',
      provider: 'LocalDiskProvider',
      role: 'archive-primary',
      writable: true,
      healthy: true,
      healthState: 'healthy',
    },
    {
      id: 'target-replica',
      libraryId: 'library-demo',
      name: 'Replica Drive',
      provider: 'ExternalDriveProvider',
      role: 'archive-replica',
      writable: false,
      healthy: false,
      healthState: 'unavailable',
    },
  ],
  jobs: [],
  restoreDrills: [
    {
      id: 'restore-drill-demo',
      libraryId: 'library-demo',
      status: 'scheduled',
    },
  ],
}

export default function HomePage() {
  return (
    <DashboardScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      snapshot={snapshot}
    />
  )
}
