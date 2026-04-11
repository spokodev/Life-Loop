import type {
  AssetLifecycleState,
  CleanupCandidate,
  CleanupReviewReadiness,
  RestoreDrill,
} from '@life-loop/shared-types'

import { evaluateCleanupReadiness } from '../lib/cleanup-readiness'
import { getDatabasePool } from './client'

type CleanupCandidateRow = {
  assetId: string
  libraryId: string
  filename: string
  lifecycleState: AssetLifecycleState
  verifiedPrimaryCount: number
  verifiedReplicaCount: number
  verifiedRestoreEvidenceCount: number
  restoreDrillPassed: boolean
  latestRestoreDrillStatus: RestoreDrill['status'] | null
}

export async function getCleanupReviewReadiness(
  libraryId?: string,
): Promise<CleanupReviewReadiness> {
  const databasePool = getDatabasePool()
  const result = await databasePool.query<CleanupCandidateRow>(
    `
      with latest_restore_drill as (
        select distinct on (library_id)
          library_id,
          status as latest_restore_drill_status
        from restore_drills
        order by library_id, created_at desc
      ),
      restore_summary as (
        select
          library_id,
          bool_or(status = 'passed') as restore_drill_passed
        from restore_drills
        group by library_id
      ),
      asset_restore_evidence as (
        select
          rde.asset_id,
          count(rde.id) filter (
            where
              rde.evidence_status = 'verified'
              and rd.status = 'passed'
          )::int as verified_restore_evidence_count
        from restore_drill_evidence rde
        join restore_drills rd on rd.id = rde.restore_drill_id
        group by rde.asset_id
      )
      select
        a.id::text as "assetId",
        a.library_id::text as "libraryId",
        a.filename,
        a.lifecycle_state as "lifecycleState",
        count(distinct p.id) filter (
          where
            b.kind = 'original'
            and p.role = 'archive-primary'
            and p.health_state = 'healthy'
            and p.verified_at is not null
        )::int as "verifiedPrimaryCount",
        count(distinct p.id) filter (
          where
            b.kind = 'original'
            and p.role = 'archive-replica'
            and p.health_state = 'healthy'
            and p.verified_at is not null
        )::int as "verifiedReplicaCount",
        coalesce(are.verified_restore_evidence_count, 0) as "verifiedRestoreEvidenceCount",
        coalesce(rs.restore_drill_passed, false) as "restoreDrillPassed",
        lrd.latest_restore_drill_status as "latestRestoreDrillStatus"
      from assets a
      left join blobs b on b.asset_id = a.id
      left join placements p on p.blob_id = b.id
      left join restore_summary rs on rs.library_id = a.library_id
      left join latest_restore_drill lrd on lrd.library_id = a.library_id
      left join asset_restore_evidence are on are.asset_id = a.id
      where ($1::uuid is null or a.library_id = $1::uuid)
      group by
        a.id,
        are.verified_restore_evidence_count,
        rs.restore_drill_passed,
        lrd.latest_restore_drill_status
      order by a.filename asc
      limit 100
    `,
    [libraryId ?? null],
  )

  const candidates = result.rows.map(mapCleanupCandidateRow)

  return {
    summary: {
      eligibleForReviewCount: candidates.filter(
        (candidate) => candidate.cleanupStatus === 'eligible_for_review',
      ).length,
      blockedCount: candidates.filter((candidate) => candidate.cleanupStatus === 'blocked').length,
      manualReviewCount: candidates.filter(
        (candidate) => candidate.cleanupStatus === 'manual_review',
      ).length,
      totalCandidates: candidates.length,
    },
    candidates,
  }
}

function mapCleanupCandidateRow(row: CleanupCandidateRow): CleanupCandidate {
  const readiness = evaluateCleanupReadiness({
    lifecycleState: row.lifecycleState,
    verifiedPrimaryCount: row.verifiedPrimaryCount,
    verifiedReplicaCount: row.verifiedReplicaCount,
    verifiedRestoreEvidenceCount: row.verifiedRestoreEvidenceCount,
    restoreDrillPassed: row.restoreDrillPassed,
    ...(row.latestRestoreDrillStatus
      ? { latestRestoreDrillStatus: row.latestRestoreDrillStatus }
      : {}),
  })

  return {
    assetId: row.assetId,
    libraryId: row.libraryId,
    filename: row.filename,
    lifecycleState: row.lifecycleState,
    cleanupStatus: readiness.cleanupStatus,
    blockers: readiness.blockers,
    evidence: readiness.evidence,
  }
}
