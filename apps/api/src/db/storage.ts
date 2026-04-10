import type {
  StorageReadiness,
  StorageReadinessTarget,
  StorageTarget,
} from '@life-loop/shared-types'

import { getDatabasePool } from './client'

type StorageReadinessRow = StorageTarget & {
  placementCount: number
  verifiedPlacementCount: number
  pendingVerificationCount: number
  lastVerifiedAt: string | null
}

export async function getStorageReadiness(): Promise<StorageReadiness> {
  const databasePool = getDatabasePool()
  const result = await databasePool.query<StorageReadinessRow>(
    `
      select
        st.id::text,
        st.library_id::text as "libraryId",
        st.name,
        st.role,
        st.provider,
        st.writable,
        st.healthy,
        st.health_state as "healthState",
        count(p.id)::int as "placementCount",
        count(p.id) filter (
          where p.health_state = 'healthy' and p.verified_at is not null
        )::int as "verifiedPlacementCount",
        count(p.id) filter (
          where p.verified_at is null or p.health_state <> 'healthy'
        )::int as "pendingVerificationCount",
        to_char(
          max(p.verified_at) at time zone 'utc',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ) as "lastVerifiedAt"
      from storage_targets st
      left join placements p on p.storage_target_id = st.id
      group by st.id
      order by st.created_at asc
      limit 50
    `,
  )

  const targets = result.rows.map(mapStorageReadinessRow)

  return {
    summary: {
      healthyTargets: targets.filter((target) => target.connectionState === 'healthy').length,
      staleTargets: targets.filter((target) => target.connectionState === 'stale').length,
      unavailableTargets: targets.filter((target) => target.connectionState === 'unavailable')
        .length,
      pendingVerificationPlacements: targets.reduce(
        (total, target) => total + target.pendingVerificationCount,
        0,
      ),
    },
    targets,
  }
}

function mapStorageReadinessRow(row: StorageReadinessRow): StorageReadinessTarget {
  const connectionState = deriveConnectionState(row)
  const warning = deriveWarning(row, connectionState)

  return {
    id: row.id,
    libraryId: row.libraryId,
    name: row.name,
    role: row.role,
    provider: row.provider,
    writable: row.writable,
    healthy: row.healthy,
    healthState: row.healthState,
    connectionState,
    placementCount: row.placementCount,
    verifiedPlacementCount: row.verifiedPlacementCount,
    pendingVerificationCount: row.pendingVerificationCount,
    spacePressure: 'telemetry-unavailable',
    ...(row.lastVerifiedAt ? { lastVerifiedAt: row.lastVerifiedAt } : {}),
    ...(warning ? { warning } : {}),
  }
}

function deriveConnectionState(
  row: StorageReadinessRow,
): StorageReadinessTarget['connectionState'] {
  if (!row.writable && !row.healthy) {
    return 'unavailable'
  }

  if (row.role === 'archive-replica' && !row.healthy) {
    return 'stale'
  }

  if (row.healthState === 'verifying' || row.pendingVerificationCount > 0) {
    return 'verifying'
  }

  if (!row.healthy || row.healthState === 'needs_review') {
    return 'unavailable'
  }

  return 'healthy'
}

function deriveWarning(
  row: StorageReadinessRow,
  connectionState: StorageReadinessTarget['connectionState'],
) {
  if (row.role === 'archive-replica' && connectionState === 'stale') {
    return 'Replica target needs attention before archive safety can be treated as fully current.'
  }

  if (connectionState === 'unavailable') {
    return 'This target is configured, but the control plane cannot currently treat it as available.'
  }

  if (connectionState === 'verifying') {
    return 'Placements exist, but verification is still incomplete.'
  }

  return null
}
