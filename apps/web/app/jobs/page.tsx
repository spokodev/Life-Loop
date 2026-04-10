import type { DashboardSnapshot, JobRun } from '@life-loop/shared-types'

import { JobsScreen } from '../../components/jobs-screen'
import { webEnv } from '../../lib/env'

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

async function getJobsPageData() {
  const [snapshotResult, jobsResult] = await Promise.allSettled([
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/status`, {
      cache: 'no-store',
    }),
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/jobs`, {
      cache: 'no-store',
    }),
  ])

  let snapshot = fallbackSnapshot
  let usingSnapshotFallback = true

  if (snapshotResult.status === 'fulfilled' && snapshotResult.value.ok) {
    snapshot = (await snapshotResult.value.json()) as DashboardSnapshot
    usingSnapshotFallback = false
  }

  let jobs = snapshot.jobs
  let usingJobsFallback = true

  if (jobsResult.status === 'fulfilled' && jobsResult.value.ok) {
    const jobsPayload = (await jobsResult.value.json()) as { jobs: JobRun[] }
    jobs = jobsPayload.jobs
    usingJobsFallback = false
  }

  return {
    jobs,
    snapshot,
    usingJobsFallback,
    usingSnapshotFallback,
  }
}

export default async function JobsPage() {
  const pageData = await getJobsPageData()

  return (
    <JobsScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
