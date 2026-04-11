import assert from 'node:assert/strict'
import test from 'node:test'

import { cleanupReadinessBlockers, evaluateCleanupReadiness } from './cleanup-readiness'

test('evaluateCleanupReadiness blocks uploaded or ingested assets without archive evidence', () => {
  const result = evaluateCleanupReadiness({
    lifecycleState: 'ingested',
    verifiedPrimaryCount: 0,
    verifiedReplicaCount: 0,
    verifiedRestoreEvidenceCount: 0,
    restoreDrillPassed: false,
  })

  assert.equal(result.cleanupStatus, 'blocked')
  assert.deepEqual(result.blockers, [
    cleanupReadinessBlockers.primaryRequired,
    cleanupReadinessBlockers.replicaRequired,
    cleanupReadinessBlockers.restoreRequired,
  ])
})

test('evaluateCleanupReadiness keeps cleanup blocked with only a verified primary', () => {
  const result = evaluateCleanupReadiness({
    lifecycleState: 'archived_primary_verified',
    verifiedPrimaryCount: 1,
    verifiedReplicaCount: 0,
    verifiedRestoreEvidenceCount: 0,
    restoreDrillPassed: false,
  })

  assert.equal(result.cleanupStatus, 'blocked')
  assert.deepEqual(result.blockers, [
    cleanupReadinessBlockers.replicaRequired,
    cleanupReadinessBlockers.restoreRequired,
  ])
})

test('evaluateCleanupReadiness requires restore evidence after primary and replica verification', () => {
  const result = evaluateCleanupReadiness({
    lifecycleState: 'safe_archived',
    verifiedPrimaryCount: 1,
    verifiedReplicaCount: 1,
    verifiedRestoreEvidenceCount: 0,
    restoreDrillPassed: false,
    latestRestoreDrillStatus: 'failed',
  })

  assert.equal(result.cleanupStatus, 'blocked')
  assert.deepEqual(result.blockers, [cleanupReadinessBlockers.restoreRequired])
  assert.equal(result.evidence.latestRestoreDrillStatus, 'failed')
  assert.equal(result.evidence.verifiedRestoreEvidenceCount, 0)
})

test('evaluateCleanupReadiness still blocks library-level restore posture without asset evidence', () => {
  const result = evaluateCleanupReadiness({
    lifecycleState: 'safe_archived',
    verifiedPrimaryCount: 1,
    verifiedReplicaCount: 1,
    verifiedRestoreEvidenceCount: 0,
    restoreDrillPassed: true,
    latestRestoreDrillStatus: 'passed',
  })

  assert.equal(result.cleanupStatus, 'blocked')
  assert.deepEqual(result.blockers, [cleanupReadinessBlockers.restoreRequired])
})

test('evaluateCleanupReadiness only reaches manual review eligibility with archive and asset restore evidence', () => {
  const result = evaluateCleanupReadiness({
    lifecycleState: 'safe_archived',
    verifiedPrimaryCount: 1,
    verifiedReplicaCount: 1,
    verifiedRestoreEvidenceCount: 1,
    restoreDrillPassed: true,
    latestRestoreDrillStatus: 'passed',
  })

  assert.equal(result.cleanupStatus, 'eligible_for_review')
  assert.deepEqual(result.blockers, [])
})

test('evaluateCleanupReadiness never treats manual states as automatic cleanup approval', () => {
  const manualReview = evaluateCleanupReadiness({
    lifecycleState: 'manual_review',
    verifiedPrimaryCount: 1,
    verifiedReplicaCount: 1,
    verifiedRestoreEvidenceCount: 1,
    restoreDrillPassed: true,
  })
  const confirmed = evaluateCleanupReadiness({
    lifecycleState: 'cleanup_confirmed',
    verifiedPrimaryCount: 1,
    verifiedReplicaCount: 1,
    verifiedRestoreEvidenceCount: 1,
    restoreDrillPassed: true,
  })

  assert.equal(manualReview.cleanupStatus, 'manual_review')
  assert.deepEqual(manualReview.blockers, [cleanupReadinessBlockers.manualReviewRequired])
  assert.equal(confirmed.cleanupStatus, 'manual_review')
  assert.deepEqual(confirmed.blockers, [cleanupReadinessBlockers.confirmedStateRequiresAudit])
})
