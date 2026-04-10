import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveArchivePlacementJobStatus, deriveAssetLifecycleState } from './asset-lifecycle'

test('deriveAssetLifecycleState stays conservative until primary and replica are verified', () => {
  assert.equal(
    deriveAssetLifecycleState([
      {
        blobKind: 'original',
        role: 'archive-primary',
        storageTargetId: 'primary',
        verified: true,
      },
    ]),
    'archived_primary_verified',
  )

  assert.equal(
    deriveAssetLifecycleState([
      {
        blobKind: 'original',
        role: 'archive-primary',
        storageTargetId: 'primary',
        verified: true,
      },
      {
        blobKind: 'original',
        role: 'archive-replica',
        storageTargetId: 'replica',
        verified: true,
      },
    ]),
    'safe_archived',
  )
})

test('deriveAssetLifecycleState distinguishes pending verification from verified replica state', () => {
  assert.equal(
    deriveAssetLifecycleState([
      {
        blobKind: 'original',
        role: 'archive-primary',
        storageTargetId: 'primary',
      },
    ]),
    'archived_primary_pending_verify',
  )

  assert.equal(
    deriveAssetLifecycleState([
      {
        blobKind: 'original',
        role: 'archive-primary',
        storageTargetId: 'primary',
        verified: true,
      },
      {
        blobKind: 'original',
        role: 'archive-replica',
        storageTargetId: 'replica',
      },
    ]),
    'archived_replica_pending_verify',
  )
})

test('deriveArchivePlacementJobStatus only marks fully safe archive reports as succeeded', () => {
  assert.equal(
    deriveArchivePlacementJobStatus([
      {
        blobKind: 'original',
        role: 'archive-primary',
        storageTargetId: 'primary',
        verified: true,
      },
    ]),
    'completed_with_warnings',
  )

  assert.equal(
    deriveArchivePlacementJobStatus([
      {
        blobKind: 'original',
        role: 'archive-primary',
        storageTargetId: 'primary',
        verified: true,
      },
      {
        blobKind: 'original',
        role: 'archive-replica',
        storageTargetId: 'replica',
        verified: true,
      },
    ]),
    'succeeded',
  )
})
