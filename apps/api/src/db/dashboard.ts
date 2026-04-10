import type {
  DashboardSnapshot,
  Device,
  JobRun,
  Library,
  RestoreDrill,
  StorageTarget,
} from '@life-loop/shared-types'

import { getDatabasePool } from './client'

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const databasePool = getDatabasePool()

  const [libraryResult, deviceResult, storageTargetResult, jobResult, restoreDrillResult] =
    await Promise.all([
      databasePool.query<Library>(
        `
          select
            l.id::text,
            l.slug,
            l.name,
            l.description,
            coalesce(count(a.id), 0)::int as "assetCount"
          from libraries l
          left join assets a on a.library_id = l.id
          group by l.id
          order by l.created_at asc
        `,
      ),
      databasePool.query<Device>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            name,
            platform,
            status,
            to_char(last_seen_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastSeenAt"
          from devices
          order by created_at desc
          limit 12
        `,
      ),
      databasePool.query<StorageTarget>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            name,
            role,
            provider,
            writable,
            healthy,
            health_state as "healthState"
          from storage_targets
          order by created_at asc
          limit 12
        `,
      ),
      databasePool.query<JobRun>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            asset_id::text as "assetId",
            device_id::text as "deviceId",
            kind,
            status,
            correlation_id::text as "correlationId",
            attempt_count as "attemptCount",
            to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
            to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt",
            blocking_reason as "blockingReason"
          from job_runs
          order by updated_at desc
          limit 12
        `,
      ),
      databasePool.query<RestoreDrill>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            status,
            sample_size as "sampleSize",
            to_char(started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startedAt",
            to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "completedAt"
            ,
            notes
          from restore_drills
          order by created_at desc
          limit 12
        `,
      ),
    ])

  const storageTargets = storageTargetResult.rows
  const restoreDrills = restoreDrillResult.rows
  const jobs = jobResult.rows

  return {
    health: {
      api: 'healthy',
      database: 'healthy',
      worker: jobs.some((job) => job.kind === 'device-heartbeat' && job.status === 'succeeded')
        ? 'healthy'
        : 'degraded',
      restoreDrills: restoreDrills.some((drill) => drill.status === 'failed')
        ? 'attention-required'
        : 'passing',
    },
    libraries: libraryResult.rows,
    devices: deviceResult.rows,
    storageTargets,
    jobs,
    restoreDrills,
  }
}
