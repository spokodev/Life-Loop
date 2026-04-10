import type { Asset, DashboardSnapshot, JobRun } from '@life-loop/shared-types'

import { webEnv } from './env'

export const fallbackSnapshot: DashboardSnapshot = {
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

export async function getControlPlaneSnapshot() {
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

export async function getActivityPageData() {
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

export async function getLibraryPageData() {
  const [snapshotResult, assetsResult] = await Promise.allSettled([
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/status`, {
      cache: 'no-store',
    }),
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/assets`, {
      cache: 'no-store',
    }),
  ])

  let snapshot = fallbackSnapshot
  let usingSnapshotFallback = true

  if (snapshotResult.status === 'fulfilled' && snapshotResult.value.ok) {
    snapshot = (await snapshotResult.value.json()) as DashboardSnapshot
    usingSnapshotFallback = false
  }

  let assets: Asset[] = []
  let usingAssetsFallback = true

  if (assetsResult.status === 'fulfilled' && assetsResult.value.ok) {
    const assetsPayload = (await assetsResult.value.json()) as { assets: Asset[] }
    assets = assetsPayload.assets
    usingAssetsFallback = false
  }

  return {
    assets,
    snapshot,
    usingAssetsFallback,
    usingSnapshotFallback,
  }
}
