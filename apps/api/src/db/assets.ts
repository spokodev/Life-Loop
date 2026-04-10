import type {
  Asset,
  AssetBlobInput,
  AssetPlacementInput,
  JobRun,
  PlacementHealthState,
  ReportIngestAssetInput,
  ReportIngestAssetResponse,
  StorageTarget,
} from '@life-loop/shared-types'
import type { PoolClient } from 'pg'

import { deriveArchivePlacementJobStatus, deriveAssetLifecycleState } from '../lib/asset-lifecycle'
import { insertAuditEvent } from './audit'
import { getDatabasePool } from './client'
import { authenticateDeviceCredential } from './device-auth'

type AssetRow = {
  id: string
  libraryId: string
  sourceDeviceId: string | null
  filename: string
  captureDate: string | null
  lifecycleState: Asset['lifecycleState']
  blobCount: number
  placementCount: number
  verifiedPlacementCount: number
}

type JobRow = JobRun

type StorageTargetRow = StorageTarget

type BlobRow = {
  id: string
  kind: AssetBlobInput['kind']
  checksumSha256: string
}

type ExistingReportRow = {
  assetId: string
  jobId: string
}

export async function listAssets(libraryId?: string) {
  const databasePool = getDatabasePool()
  const result = libraryId
    ? await databasePool.query<AssetRow>(
        `${assetSelectSql} where a.library_id = $1::uuid ${assetGroupOrderSql}`,
        [libraryId],
      )
    : await databasePool.query<AssetRow>(`${assetSelectSql} ${assetGroupOrderSql}`)

  return result.rows.map(mapAssetRow)
}

export async function reportIngestedAsset(
  authorizationToken: string,
  input: ReportIngestAssetInput,
  correlationId: string,
  idempotencyKey: string,
): Promise<ReportIngestAssetResponse> {
  validateIngestReport(input)

  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const device = await authenticateDeviceCredential(client, authorizationToken)

    if (device.libraryId !== input.libraryId) {
      throw new Error('Authenticated device does not belong to the requested library.')
    }

    if (device.status !== 'active') {
      throw new Error('Authenticated device must be active before reporting ingest state.')
    }

    const existingReport = await findIngestReportByIdempotencyKey(client, idempotencyKey)

    if (existingReport) {
      const asset = await findAssetById(client, existingReport.assetId)
      const job = await findJobById(client, existingReport.jobId)

      if (!asset || !job) {
        throw new Error('Existing ingest report is missing linked asset or job state.')
      }

      await client.query('commit')

      return {
        asset,
        replayed: true,
        job,
      }
    }

    const storageTargets = await findStorageTargetsByIds(
      client,
      input.libraryId,
      input.placements.map((placement) => placement.storageTargetId),
    )

    validateStorageTargetAssignments(input.placements, storageTargets)

    const lifecycleState = deriveAssetLifecycleState(input.placements)
    const assetResult = await client.query<{ id: string }>(
      `
        insert into assets (
          library_id,
          source_device_id,
          filename,
          capture_date,
          lifecycle_state,
          asset_metadata
        )
        values ($1::uuid, $2::uuid, $3, $4::timestamptz, $5, $6::jsonb)
        returning id::text
      `,
      [
        input.libraryId,
        device.id,
        input.filename,
        input.captureDate ?? null,
        lifecycleState,
        JSON.stringify(input.assetMetadata ?? {}),
      ],
    )

    const insertedAsset = assetResult.rows[0]

    if (!insertedAsset) {
      throw new Error('Asset insert did not return a row.')
    }

    await client.query(
      `
        insert into asset_versions (asset_id, version_label, status)
        values ($1::uuid, 'v1', 'current')
      `,
      [insertedAsset.id],
    )

    const blobMap = new Map<string, BlobRow>()

    for (const blob of input.blobs) {
      const blobResult = await client.query<BlobRow>(
        `
          insert into blobs (asset_id, kind, checksum_sha256, size_bytes, mime_type)
          values ($1::uuid, $2, $3, $4, $5)
          returning
            id::text,
            kind,
            checksum_sha256 as "checksumSha256"
        `,
        [insertedAsset.id, blob.kind, blob.checksumSha256, blob.sizeBytes, blob.mimeType ?? null],
      )

      const insertedBlob = blobResult.rows[0]

      if (!insertedBlob) {
        throw new Error('Blob insert did not return a row.')
      }

      blobMap.set(insertedBlob.kind, insertedBlob)
    }

    for (const placement of input.placements) {
      const blob = blobMap.get(placement.blobKind)

      if (!blob) {
        throw new Error(`Placement references unknown blob kind ${placement.blobKind}.`)
      }

      const verified = isPlacementVerified(placement)
      const healthState = derivePlacementHealthState(placement)

      await client.query(
        `
          insert into placements (
            blob_id,
            storage_target_id,
            role,
            checksum_sha256,
            health_state,
            verified_at
          )
          values ($1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz)
        `,
        [
          blob.id,
          placement.storageTargetId,
          placement.role,
          placement.checksumSha256 ?? blob.checksumSha256,
          healthState,
          verified ? new Date().toISOString() : null,
        ],
      )

      await client.query(
        `
          update storage_targets
          set
            healthy = $2,
            health_state = $3,
            updated_at = now()
          where id = $1::uuid
        `,
        [placement.storageTargetId, verified, verified ? 'healthy' : 'verifying'],
      )
    }

    const jobStatus = deriveArchivePlacementJobStatus(input.placements)
    const jobResult = await client.query<JobRow>(
      `
        insert into job_runs (
          library_id,
          asset_id,
          device_id,
          kind,
          status,
          correlation_id,
          attempt_count,
          payload
        )
        values ($1::uuid, $2::uuid, $3::uuid, 'archive-placement', $4, $5::uuid, 0, $6::jsonb)
        returning
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
      `,
      [
        input.libraryId,
        insertedAsset.id,
        device.id,
        jobStatus,
        correlationId,
        JSON.stringify({
          filename: input.filename,
          lifecycleState,
          placementCount: input.placements.length,
          verifiedPlacementCount: input.placements.filter(isPlacementVerified).length,
        }),
      ],
    )

    const job = jobResult.rows[0]

    if (!job) {
      throw new Error('Archive-placement job insert did not return a row.')
    }

    await client.query(
      `
        insert into asset_ingest_reports (library_id, device_id, asset_id, job_run_id, idempotency_key)
        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)
      `,
      [input.libraryId, device.id, insertedAsset.id, job.id, idempotencyKey],
    )

    await insertAuditEvent(client, {
      actorId: device.id,
      actorType: 'device',
      correlationId,
      eventType: 'asset.ingest_reported',
      libraryId: input.libraryId,
      payload: {
        assetId: insertedAsset.id,
        blobCount: input.blobs.length,
        filename: input.filename,
        jobId: job.id,
        lifecycleState,
        placementCount: input.placements.length,
      },
    })

    const asset = await findAssetById(client, insertedAsset.id)

    if (!asset) {
      throw new Error('Inserted asset could not be reloaded.')
    }

    await client.query('commit')

    return {
      asset,
      replayed: false,
      job,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

const assetSelectSql = `
  select
    a.id::text,
    a.library_id::text as "libraryId",
    a.source_device_id::text as "sourceDeviceId",
    a.filename,
    to_char(a.capture_date at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "captureDate",
    a.lifecycle_state as "lifecycleState",
    count(distinct b.id)::int as "blobCount",
    count(distinct p.id)::int as "placementCount",
    count(distinct p.id) filter (
      where p.health_state = 'healthy' and p.verified_at is not null
    )::int as "verifiedPlacementCount"
  from assets a
  left join blobs b on b.asset_id = a.id
  left join placements p on p.blob_id = b.id
`

const assetGroupOrderSql = `
  group by a.id
  order by a.created_at desc
  limit 50
`

async function findAssetById(client: PoolClient, assetId: string) {
  const result = await client.query<AssetRow>(
    `${assetSelectSql} where a.id = $1::uuid ${assetGroupOrderSql}`,
    [assetId],
  )

  const row = result.rows[0]
  return row ? mapAssetRow(row) : null
}

async function findJobById(client: PoolClient, jobId: string) {
  const result = await client.query<JobRow>(
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
      where id = $1::uuid
      limit 1
    `,
    [jobId],
  )

  return result.rows[0] ?? null
}

async function findIngestReportByIdempotencyKey(client: PoolClient, idempotencyKey: string) {
  const result = await client.query<ExistingReportRow>(
    `
      select
        asset_id::text as "assetId",
        job_run_id::text as "jobId"
      from asset_ingest_reports
      where idempotency_key = $1
      limit 1
    `,
    [idempotencyKey],
  )

  return result.rows[0] ?? null
}

async function findStorageTargetsByIds(
  client: PoolClient,
  libraryId: string,
  storageTargetIds: string[],
) {
  const uniqueIds = [...new Set(storageTargetIds)]
  const result = await client.query<StorageTargetRow>(
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
      where library_id = $1::uuid
        and id = any($2::uuid[])
    `,
    [libraryId, uniqueIds],
  )

  return result.rows
}

function validateIngestReport(input: ReportIngestAssetInput) {
  if (!input.blobs.some((blob) => blob.kind === 'original')) {
    throw new Error('Ingest reports require at least one original blob.')
  }

  if (!input.placements.some((placement) => placement.role === 'archive-primary')) {
    throw new Error('Ingest reports require at least one archive-primary placement.')
  }

  const knownBlobKinds = new Set(input.blobs.map((blob) => blob.kind))

  for (const placement of input.placements) {
    if (!knownBlobKinds.has(placement.blobKind)) {
      throw new Error(`Placement references unknown blob kind ${placement.blobKind}.`)
    }
  }
}

function validateStorageTargetAssignments(
  placements: AssetPlacementInput[],
  storageTargets: StorageTargetRow[],
) {
  const targetMap = new Map(storageTargets.map((target) => [target.id, target]))

  for (const placement of placements) {
    const target = targetMap.get(placement.storageTargetId)

    if (!target) {
      throw new Error(`Storage target ${placement.storageTargetId} was not found in this library.`)
    }

    if (target.role !== placement.role) {
      throw new Error(
        `Storage target ${target.name} is registered as ${target.role}, not ${placement.role}.`,
      )
    }
  }
}

function derivePlacementHealthState(placement: AssetPlacementInput): PlacementHealthState {
  if (placement.healthState) {
    return placement.healthState
  }

  return isPlacementVerified(placement) ? 'healthy' : 'verifying'
}

function isPlacementVerified(placement: AssetPlacementInput) {
  return placement.verified === true || placement.healthState === 'healthy'
}

function mapAssetRow(row: AssetRow): Asset {
  return {
    id: row.id,
    libraryId: row.libraryId,
    ...(row.sourceDeviceId ? { sourceDeviceId: row.sourceDeviceId } : {}),
    filename: row.filename,
    ...(row.captureDate ? { captureDate: row.captureDate } : {}),
    lifecycleState: row.lifecycleState,
    blobCount: row.blobCount,
    placementCount: row.placementCount,
    verifiedPlacementCount: row.verifiedPlacementCount,
  }
}
