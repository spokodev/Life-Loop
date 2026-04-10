import type {
  Asset,
  AssetBlobInput,
  AssetDetail,
  AssetPlacementDetail,
  AssetPlacementInput,
  Blob,
  JobRun,
  PlacementHealthState,
  ReportIngestAssetInput,
  ReportIngestAssetResponse,
  RestoreCandidate,
  RestoreReadiness,
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
  assetId: string
  kind: AssetBlobInput['kind']
  checksumSha256: string
  sizeBytes: number
  mimeType: string | null
}

type PlacementDetailRow = {
  id: string
  blobId: string
  blobKind: Blob['kind']
  storageTargetId: string
  storageTargetName: string
  storageTargetProvider: string
  storageTargetWritable: boolean
  role: AssetPlacementDetail['role']
  checksumSha256: string
  healthState: AssetPlacementDetail['healthState']
  verifiedAt: string | null
}

type ExistingReportRow = {
  assetId: string
  jobId: string
}

type RestoreCandidateRow = {
  assetId: string
  libraryId: string
  filename: string
  lifecycleState: Asset['lifecycleState']
  placementId: string | null
  storageTargetName: string | null
  role: AssetPlacementDetail['role'] | null
  healthState: AssetPlacementDetail['healthState'] | null
  verifiedAt: string | null
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

export async function getAssetDetail(assetId: string): Promise<AssetDetail | null> {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    const asset = await findAssetById(client, assetId)

    if (!asset) {
      return null
    }

    const [blobs, placements] = await Promise.all([
      listAssetBlobs(client, assetId),
      listAssetPlacements(client, assetId),
    ])

    return {
      asset,
      blobs,
      placements,
    }
  } finally {
    client.release()
  }
}

export async function getRestoreReadiness(): Promise<RestoreReadiness> {
  const databasePool = getDatabasePool()
  const result = await databasePool.query<RestoreCandidateRow>(
    `
      with ranked_placements as (
        select
          a.id::text as "assetId",
          a.library_id::text as "libraryId",
          a.filename,
          a.lifecycle_state as "lifecycleState",
          p.id::text as "placementId",
          st.name as "storageTargetName",
          p.role,
          p.health_state as "healthState",
          to_char(p.verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "verifiedAt",
          row_number() over (
            partition by a.id
            order by
              case
                when p.verified_at is not null and p.health_state = 'healthy' and p.role = 'archive-primary' then 1
                when p.verified_at is not null and p.health_state = 'healthy' and p.role = 'archive-replica' then 2
                when p.health_state = 'healthy' and p.role = 'archive-primary' then 3
                when p.health_state = 'healthy' and p.role = 'archive-replica' then 4
                when p.role = 'archive-primary' then 5
                when p.role = 'archive-replica' then 6
                else 7
              end,
              p.created_at asc nulls last
          ) as placement_rank
        from assets a
        left join blobs b
          on b.asset_id = a.id
         and b.kind = 'original'
        left join placements p on p.blob_id = b.id
        left join storage_targets st on st.id = p.storage_target_id
      )
      select
        "assetId",
        "libraryId",
        filename,
        "lifecycleState",
        "placementId",
        "storageTargetName",
        role,
        "healthState",
        "verifiedAt"
      from ranked_placements
      where placement_rank = 1
      order by filename asc
      limit 50
    `,
  )

  const candidates = result.rows.map(mapRestoreCandidateRow)

  return {
    summary: {
      readyCount: candidates.filter((candidate) => candidate.restoreStatus === 'ready').length,
      degradedCount: candidates.filter((candidate) => candidate.restoreStatus === 'degraded')
        .length,
      blockedCount: candidates.filter((candidate) => candidate.restoreStatus === 'blocked').length,
    },
    candidates,
  }
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
            asset_id::text as "assetId",
            kind,
            checksum_sha256 as "checksumSha256",
            size_bytes as "sizeBytes",
            mime_type as "mimeType"
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

async function listAssetBlobs(client: PoolClient, assetId: string) {
  const result = await client.query<BlobRow>(
    `
      select
        id::text,
        asset_id::text as "assetId",
        kind,
        checksum_sha256 as "checksumSha256",
        size_bytes as "sizeBytes",
        mime_type as "mimeType"
      from blobs
      where asset_id = $1::uuid
      order by created_at asc
    `,
    [assetId],
  )

  return result.rows.map(mapBlobRow)
}

async function listAssetPlacements(client: PoolClient, assetId: string) {
  const result = await client.query<PlacementDetailRow>(
    `
      select
        p.id::text,
        p.blob_id::text as "blobId",
        b.kind as "blobKind",
        p.storage_target_id::text as "storageTargetId",
        st.name as "storageTargetName",
        st.provider as "storageTargetProvider",
        st.writable as "storageTargetWritable",
        p.role,
        p.checksum_sha256 as "checksumSha256",
        p.health_state as "healthState",
        to_char(p.verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "verifiedAt"
      from placements p
      inner join blobs b on b.id = p.blob_id
      inner join storage_targets st on st.id = p.storage_target_id
      where b.asset_id = $1::uuid
      order by p.created_at asc
    `,
    [assetId],
  )

  return result.rows.map(mapPlacementRow)
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

function mapBlobRow(row: BlobRow): Blob {
  return {
    id: row.id,
    assetId: row.assetId,
    kind: row.kind,
    checksumSha256: row.checksumSha256,
    sizeBytes: row.sizeBytes,
    ...(row.mimeType ? { mimeType: row.mimeType } : {}),
  }
}

function mapPlacementRow(row: PlacementDetailRow): AssetPlacementDetail {
  return {
    id: row.id,
    blobId: row.blobId,
    blobKind: row.blobKind,
    storageTargetId: row.storageTargetId,
    storageTargetName: row.storageTargetName,
    storageTargetProvider: row.storageTargetProvider,
    storageTargetWritable: row.storageTargetWritable,
    role: row.role,
    checksumSha256: row.checksumSha256,
    healthState: row.healthState,
    ...(row.verifiedAt ? { verifiedAt: row.verifiedAt } : {}),
  }
}

function mapRestoreCandidateRow(row: RestoreCandidateRow): RestoreCandidate {
  if (row.placementId && row.storageTargetName) {
    const verifiedHealthy = row.verifiedAt && row.healthState === 'healthy'
    const status = verifiedHealthy ? 'ready' : 'degraded'

    return {
      assetId: row.assetId,
      libraryId: row.libraryId,
      filename: row.filename,
      lifecycleState: row.lifecycleState,
      restoreStatus: status,
      restoreSource: `${row.storageTargetName} (${row.role ?? 'unknown role'})`,
      restoreScope: 'Single asset original blob',
      expectedResult: verifiedHealthy
        ? 'The original blob should be recoverable from a verified placement.'
        : 'A restore path is recorded, but the chosen placement still needs verification or health review.',
      ...(!verifiedHealthy
        ? {
            warning:
              'Do not rely on this restore path as fully proven until the placement is verified healthy.',
          }
        : {}),
    }
  }

  return {
    assetId: row.assetId,
    libraryId: row.libraryId,
    filename: row.filename,
    lifecycleState: row.lifecycleState,
    restoreStatus: 'blocked',
    restoreScope: 'Single asset original blob',
    expectedResult: 'No restorable original placement is currently recorded for this asset.',
    warning: 'Restore readiness is blocked until at least one original placement is recorded.',
  }
}
