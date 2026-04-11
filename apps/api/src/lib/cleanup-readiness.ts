import type {
  AssetLifecycleState,
  CleanupCandidate,
  CleanupReadinessStatus,
  RestoreDrill,
} from '@life-loop/shared-types'

export const cleanupReadinessBlockers = {
  primaryRequired: 'verified archive primary required',
  replicaRequired: 'verified archive replica required',
  restoreRequired: 'asset-level verified restore-drill evidence from a passed drill required',
  manualReviewRequired: 'manual cleanup review required before any deletion action',
  confirmedStateRequiresAudit:
    'cleanup-confirmed lifecycle state requires manual audit because deletion remains disabled in MVP',
} as const

export type CleanupReadinessInput = {
  lifecycleState: AssetLifecycleState
  verifiedPrimaryCount: number
  verifiedReplicaCount: number
  verifiedRestoreEvidenceCount: number
  restoreDrillPassed: boolean
  latestRestoreDrillStatus?: RestoreDrill['status']
}

export function evaluateCleanupReadiness(input: CleanupReadinessInput): {
  cleanupStatus: CleanupReadinessStatus
  blockers: string[]
  evidence: CleanupCandidate['evidence']
} {
  const blockers = deriveEvidenceBlockers(input)

  if (input.lifecycleState === 'cleanup_confirmed') {
    return {
      cleanupStatus: 'manual_review',
      blockers: [cleanupReadinessBlockers.confirmedStateRequiresAudit, ...blockers],
      evidence: buildEvidence(input),
    }
  }

  if (input.lifecycleState === 'manual_review') {
    return {
      cleanupStatus: 'manual_review',
      blockers:
        blockers.length > 0
          ? [cleanupReadinessBlockers.manualReviewRequired, ...blockers]
          : [cleanupReadinessBlockers.manualReviewRequired],
      evidence: buildEvidence(input),
    }
  }

  if (blockers.length > 0) {
    return {
      cleanupStatus: 'blocked',
      blockers,
      evidence: buildEvidence(input),
    }
  }

  return {
    cleanupStatus: 'eligible_for_review',
    blockers: [],
    evidence: buildEvidence(input),
  }
}

function deriveEvidenceBlockers(input: CleanupReadinessInput) {
  const blockers: string[] = []

  if (input.verifiedPrimaryCount < 1) {
    blockers.push(cleanupReadinessBlockers.primaryRequired)
  }

  if (input.verifiedReplicaCount < 1) {
    blockers.push(cleanupReadinessBlockers.replicaRequired)
  }

  if (!input.restoreDrillPassed || input.verifiedRestoreEvidenceCount < 1) {
    blockers.push(cleanupReadinessBlockers.restoreRequired)
  }

  return blockers
}

function buildEvidence(input: CleanupReadinessInput): CleanupCandidate['evidence'] {
  return {
    verifiedPrimaryCount: input.verifiedPrimaryCount,
    verifiedReplicaCount: input.verifiedReplicaCount,
    verifiedRestoreEvidenceCount: input.verifiedRestoreEvidenceCount,
    restoreDrillPassed: input.restoreDrillPassed,
    ...(input.latestRestoreDrillStatus
      ? { latestRestoreDrillStatus: input.latestRestoreDrillStatus }
      : {}),
  }
}
