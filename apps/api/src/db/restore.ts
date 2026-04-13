import type {
  RecordRestoreDrillEvidenceInput,
  RecordRestoreDrillEvidenceResponse,
  RestoreDrill,
  RestoreDrillDetail,
  RestoreDrillEvidence,
} from '@life-loop/shared-types'
import type { PoolClient } from 'pg'

import { validateRestoreDrillEvidenceInput } from '../lib/restore-evidence-rules'
import { insertAuditEvent } from './audit'
import { getDatabasePool } from './client'
import { authenticateDeviceCredential } from './device-auth'

type RestoreDrillRow = RestoreDrill
type RestoreDrillEvidenceRow = RestoreDrillEvidence

type RestoreDrillEvidenceSummary = {
  evidenceCount: number
  verifiedCount: number
  failedCount: number
  blockedCount: number
  partialCount: number
}

export async function listRestoreDrillDetails(): Promise<RestoreDrillDetail[]> {
  const databasePool = getDatabasePool()
  const drillsResult = await databasePool.query<RestoreDrillRow>(
    `
      select
        id::text,
        library_id::text as "libraryId",
        status,
        sample_size as "sampleSize",
        to_char(started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startedAt",
        to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "completedAt",
        notes
      from restore_drills
      order by created_at desc
      limit 25
    `,
  )

  if (drillsResult.rows.length === 0) {
    return []
  }

  const evidenceResult = await databasePool.query<RestoreDrillEvidenceRow>(
    `
      select
        id::text,
        restore_drill_id::text as "restoreDrillId",
        asset_id::text as "assetId",
        storage_target_id::text as "storageTargetId",
        candidate_status as "candidateStatus",
        evidence_status as "evidenceStatus",
        checksum_sha256 as "checksumSha256",
        safe_error_class as "safeErrorClass",
        summary,
        to_char(verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "verifiedAt",
        to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
        to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
      from restore_drill_evidence
      where restore_drill_id = any($1::uuid[])
      order by created_at asc
    `,
    [drillsResult.rows.map((drill) => drill.id)],
  )

  const evidenceByDrillId = new Map<string, RestoreDrillEvidence[]>()
  for (const row of evidenceResult.rows) {
    const existing = evidenceByDrillId.get(row.restoreDrillId) ?? []
    existing.push(row)
    evidenceByDrillId.set(row.restoreDrillId, existing)
  }

  return drillsResult.rows.map((drill) => ({
    drill,
    evidence: evidenceByDrillId.get(drill.id) ?? [],
  }))
}

export async function recordRestoreDrillEvidence(
  authorizationToken: string,
  restoreDrillId: string,
  input: RecordRestoreDrillEvidenceInput,
  correlationId: string,
): Promise<RecordRestoreDrillEvidenceResponse> {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')
    const device = await authenticateDeviceCredential(client, authorizationToken)

    if (device.status !== 'active') {
      throw new Error('Authenticated device must be active before reporting restore evidence.')
    }

    const drill = await findRestoreDrillById(client, restoreDrillId, true)

    if (!drill) {
      throw new Error('Restore drill not found.')
    }

    if (drill.libraryId !== device.libraryId) {
      throw new Error('Authenticated device does not belong to the restore drill library.')
    }

    const validationMessage = validateRestoreDrillEvidenceInput(input)

    if (validationMessage) {
      throw new Error(validationMessage)
    }

    await assertAssetBelongsToLibrary(client, input.assetId, drill.libraryId)

    if (input.storageTargetId) {
      await assertStorageTargetBelongsToLibrary(client, input.storageTargetId, drill.libraryId)
    }

    if (input.evidenceStatus === 'verified') {
      await assertVerifiedOriginalPlacementEvidence(client, input, drill.libraryId)
    }

    const evidenceResult = await client.query<RestoreDrillEvidenceRow>(
      `
        insert into restore_drill_evidence (
          restore_drill_id,
          asset_id,
          storage_target_id,
          candidate_status,
          evidence_status,
          checksum_sha256,
          safe_error_class,
          summary,
          verified_at
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::timestamptz)
        on conflict (restore_drill_id, asset_id) do update
        set
          storage_target_id = excluded.storage_target_id,
          candidate_status = excluded.candidate_status,
          evidence_status = excluded.evidence_status,
          checksum_sha256 = excluded.checksum_sha256,
          safe_error_class = excluded.safe_error_class,
          summary = excluded.summary,
          verified_at = excluded.verified_at,
          updated_at = now()
        returning
          id::text,
          restore_drill_id::text as "restoreDrillId",
          asset_id::text as "assetId",
          storage_target_id::text as "storageTargetId",
          candidate_status as "candidateStatus",
          evidence_status as "evidenceStatus",
          checksum_sha256 as "checksumSha256",
          safe_error_class as "safeErrorClass",
          summary,
          to_char(verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "verifiedAt",
          to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
          to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
      `,
      [
        restoreDrillId,
        input.assetId,
        input.storageTargetId ?? null,
        input.candidateStatus,
        input.evidenceStatus,
        input.checksumSha256 ?? null,
        input.safeErrorClass ?? null,
        input.summary,
        input.verifiedAt ?? (input.evidenceStatus === 'verified' ? new Date().toISOString() : null),
      ],
    )
    const evidence = evidenceResult.rows[0]

    if (!evidence) {
      throw new Error('Restore evidence insert did not return a row.')
    }

    const updatedDrill = await rollUpRestoreDrillStatus(client, drill)

    await insertAuditEvent(client, {
      actorId: device.id,
      actorType: 'device',
      correlationId,
      eventType: 'restore_drill.evidence_recorded',
      libraryId: drill.libraryId,
      payload: {
        assetId: input.assetId,
        evidenceStatus: input.evidenceStatus,
        restoreDrillId,
        safeErrorClass: input.safeErrorClass ?? null,
        storageTargetId: input.storageTargetId ?? null,
      },
    })

    await client.query('commit')

    return {
      drill: updatedDrill,
      evidence,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function rollUpRestoreDrillStatus(client: PoolClient, drill: RestoreDrill) {
  const summaryResult = await client.query<RestoreDrillEvidenceSummary>(
    `
      select
        count(*)::int as "evidenceCount",
        count(*) filter (where evidence_status = 'verified')::int as "verifiedCount",
        count(*) filter (where evidence_status = 'failed')::int as "failedCount",
        count(*) filter (where evidence_status = 'blocked')::int as "blockedCount",
        count(*) filter (where evidence_status = 'partial')::int as "partialCount"
      from restore_drill_evidence
      where restore_drill_id = $1::uuid
    `,
    [drill.id],
  )
  const summary = summaryResult.rows[0]

  if (!summary) {
    throw new Error('Restore drill evidence summary did not return a row.')
  }

  const failedEvidenceCount = summary.failedCount + summary.blockedCount
  const hasCompleteSample = summary.evidenceCount >= drill.sampleSize
  const nextStatus =
    failedEvidenceCount > 0
      ? 'failed'
      : hasCompleteSample && summary.verifiedCount >= drill.sampleSize
        ? 'passed'
        : 'running'
  const notes =
    nextStatus === 'passed'
      ? `Restore drill passed with ${summary.verifiedCount} verified samples.`
      : nextStatus === 'failed'
        ? `Restore drill failed with ${failedEvidenceCount} failed or blocked samples.`
        : `Restore drill has ${summary.evidenceCount}/${drill.sampleSize} evidence records; ${summary.verifiedCount} verified, ${summary.partialCount} partial.`

  const updatedResult = await client.query<RestoreDrillRow>(
    `
      update restore_drills
      set
        status = $2,
        started_at = coalesce(started_at, now()),
        completed_at = case when $2 in ('passed', 'failed') then now() else null end,
        notes = $3
      where id = $1::uuid
      returning
        id::text,
        library_id::text as "libraryId",
        status,
        sample_size as "sampleSize",
        to_char(started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startedAt",
        to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "completedAt",
        notes
    `,
    [drill.id, nextStatus, notes],
  )

  const updatedDrill = updatedResult.rows[0]

  if (!updatedDrill) {
    throw new Error('Restore drill status update did not return a row.')
  }

  return updatedDrill
}

async function findRestoreDrillById(client: PoolClient, restoreDrillId: string, forUpdate = false) {
  const result = await client.query<RestoreDrillRow>(
    `
      select
        id::text,
        library_id::text as "libraryId",
        status,
        sample_size as "sampleSize",
        to_char(started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startedAt",
        to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "completedAt",
        notes
      from restore_drills
      where id = $1::uuid
      ${forUpdate ? 'for update' : ''}
      limit 1
    `,
    [restoreDrillId],
  )

  return result.rows[0]
}

async function assertAssetBelongsToLibrary(client: PoolClient, assetId: string, libraryId: string) {
  const result = await client.query<{ id: string }>(
    `
      select id::text
      from assets
      where id = $1::uuid
        and library_id = $2::uuid
      limit 1
    `,
    [assetId, libraryId],
  )

  if (!result.rows[0]) {
    throw new Error('Asset does not belong to the restore drill library.')
  }
}

async function assertStorageTargetBelongsToLibrary(
  client: PoolClient,
  storageTargetId: string,
  libraryId: string,
) {
  const result = await client.query<{ id: string }>(
    `
      select id::text
      from storage_targets
      where id = $1::uuid
        and library_id = $2::uuid
      limit 1
    `,
    [storageTargetId, libraryId],
  )

  if (!result.rows[0]) {
    throw new Error('Storage target does not belong to the restore drill library.')
  }
}

async function assertVerifiedOriginalPlacementEvidence(
  client: PoolClient,
  input: RecordRestoreDrillEvidenceInput,
  libraryId: string,
) {
  const result = await client.query<{ id: string }>(
    `
      select p.id::text
      from placements p
      join blobs b on b.id = p.blob_id
      join storage_targets st on st.id = p.storage_target_id
      where b.asset_id = $1::uuid
        and b.kind = 'original'
        and st.library_id = $2::uuid
        and st.id = $3::uuid
        and p.health_state = 'healthy'
        and p.verified_at is not null
        and p.checksum_sha256 = $4
      limit 1
    `,
    [input.assetId, libraryId, input.storageTargetId, input.checksumSha256],
  )

  if (!result.rows[0]) {
    throw new Error(
      'Verified restore evidence requires a matching healthy verified original placement.',
    )
  }
}
