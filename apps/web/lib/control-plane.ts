import type {
  Asset,
  AssetDetail,
  AuditEvent,
  DashboardSnapshot,
  JobRun,
  RestoreDrillDetail,
  RestoreReadiness,
  StorageReadiness,
} from '@life-loop/shared-types'

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
  const [snapshotResult, jobsResult, auditEventsResult] = await Promise.allSettled([
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/status`, {
      cache: 'no-store',
    }),
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/jobs`, {
      cache: 'no-store',
    }),
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/audit-events`, {
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

  let auditEvents: AuditEvent[] = []
  let usingAuditFallback = true

  if (auditEventsResult.status === 'fulfilled' && auditEventsResult.value.ok) {
    const auditPayload = (await auditEventsResult.value.json()) as { auditEvents: AuditEvent[] }
    auditEvents = auditPayload.auditEvents
    usingAuditFallback = false
  }

  return {
    auditEvents,
    jobs,
    snapshot,
    usingAuditFallback,
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

export async function getAssetDetailPageData(assetId: string) {
  const [snapshotResult, detailResult] = await Promise.allSettled([
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/status`, {
      cache: 'no-store',
    }),
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/assets/${assetId}`, {
      cache: 'no-store',
    }),
  ])

  let snapshot = fallbackSnapshot
  let usingSnapshotFallback = true

  if (snapshotResult.status === 'fulfilled' && snapshotResult.value.ok) {
    snapshot = (await snapshotResult.value.json()) as DashboardSnapshot
    usingSnapshotFallback = false
  }

  let assetDetail: AssetDetail | null = null
  let detailNotFound = false
  let usingDetailFallback = true

  if (detailResult.status === 'fulfilled') {
    if (detailResult.value.status === 404) {
      detailNotFound = true
      usingDetailFallback = false
    } else if (detailResult.value.ok) {
      assetDetail = (await detailResult.value.json()) as AssetDetail
      usingDetailFallback = false
    }
  }

  return {
    assetDetail,
    detailNotFound,
    snapshot,
    usingDetailFallback,
    usingSnapshotFallback,
  }
}

export async function getRestorePageData() {
  const [snapshotResult, readinessResult, drillDetailsResult] = await Promise.allSettled([
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/status`, {
      cache: 'no-store',
    }),
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/restore/readiness`, {
      cache: 'no-store',
    }),
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/restore/drills`, {
      cache: 'no-store',
    }),
  ])

  let snapshot = fallbackSnapshot
  let usingSnapshotFallback = true

  if (snapshotResult.status === 'fulfilled' && snapshotResult.value.ok) {
    snapshot = (await snapshotResult.value.json()) as DashboardSnapshot
    usingSnapshotFallback = false
  }

  let readiness: RestoreReadiness = {
    summary: {
      readyCount: 0,
      degradedCount: 0,
      blockedCount: 0,
    },
    candidates: [],
  }
  let usingReadinessFallback = true

  if (readinessResult.status === 'fulfilled' && readinessResult.value.ok) {
    readiness = (await readinessResult.value.json()) as RestoreReadiness
    usingReadinessFallback = false
  }

  let restoreDrillDetails: RestoreDrillDetail[] = []
  let usingDrillDetailsFallback = true

  if (drillDetailsResult.status === 'fulfilled' && drillDetailsResult.value.ok) {
    const payload = (await drillDetailsResult.value.json()) as { drills: RestoreDrillDetail[] }
    restoreDrillDetails = payload.drills
    usingDrillDetailsFallback = false
  }

  return {
    readiness,
    restoreDrillDetails,
    snapshot,
    usingDrillDetailsFallback,
    usingReadinessFallback,
    usingSnapshotFallback,
  }
}

export async function getStoragePageData() {
  const [snapshotResult, readinessResult] = await Promise.allSettled([
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/status`, {
      cache: 'no-store',
    }),
    fetch(`${webEnv.NEXT_PUBLIC_API_URL}/v1/storage/readiness`, {
      cache: 'no-store',
    }),
  ])

  let snapshot = fallbackSnapshot
  let usingSnapshotFallback = true

  if (snapshotResult.status === 'fulfilled' && snapshotResult.value.ok) {
    snapshot = (await snapshotResult.value.json()) as DashboardSnapshot
    usingSnapshotFallback = false
  }

  let readiness: StorageReadiness = {
    summary: {
      healthyTargets: 0,
      staleTargets: 0,
      unavailableTargets: 0,
      pendingVerificationPlacements: 0,
    },
    targets: [],
  }
  let usingReadinessFallback = true

  if (readinessResult.status === 'fulfilled' && readinessResult.value.ok) {
    readiness = (await readinessResult.value.json()) as StorageReadiness
    usingReadinessFallback = false
  }

  return {
    readiness,
    snapshot,
    usingReadinessFallback,
    usingSnapshotFallback,
  }
}
