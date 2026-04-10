import type { DashboardSnapshot } from '@life-loop/shared-types'

import { OnboardingFlow } from '../../components/onboarding-flow'
import { webEnv } from '../../lib/env'

const emptySnapshot: DashboardSnapshot = {
  health: {
    api: 'degraded',
    database: 'degraded',
    worker: 'degraded',
    restoreDrills: 'attention-required',
  },
  libraries: [],
  devices: [],
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

    return (await response.json()) as DashboardSnapshot
  } catch {
    return emptySnapshot
  }
}

export default async function OnboardingPage() {
  const snapshot = await getSnapshot()

  return (
    <OnboardingFlow
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      snapshot={snapshot}
    />
  )
}
