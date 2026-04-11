import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertHostedStagingQuota,
  createHostedStagingObjectKey,
  hostedStagingPolicy,
} from './hosted-staging-policy'

test('assertHostedStagingQuota allows requests within ADR-021 limits', () => {
  assert.doesNotThrow(() =>
    assertHostedStagingQuota({
      pendingBytes: hostedStagingPolicy.maxPendingBytesPerLibrary - 1024,
      pendingObjectCount: hostedStagingPolicy.maxPendingObjectsPerLibrary - 1,
      requestedSizeBytes: 1024,
    }),
  )
})

test('assertHostedStagingQuota blocks object size, byte quota, and object quota violations', () => {
  assert.throws(() =>
    assertHostedStagingQuota({
      pendingBytes: 0,
      pendingObjectCount: 0,
      requestedSizeBytes: hostedStagingPolicy.maxObjectBytes + 1,
    }),
  )

  assert.throws(() =>
    assertHostedStagingQuota({
      pendingBytes: hostedStagingPolicy.maxPendingBytesPerLibrary,
      pendingObjectCount: 0,
      requestedSizeBytes: 1,
    }),
  )

  assert.throws(() =>
    assertHostedStagingQuota({
      pendingBytes: 0,
      pendingObjectCount: hostedStagingPolicy.maxPendingObjectsPerLibrary,
      requestedSizeBytes: 1,
    }),
  )
})

test('createHostedStagingObjectKey never uses user filenames as authority', () => {
  const key = createHostedStagingObjectKey({
    libraryId: '11111111-1111-4111-8111-111111111111',
    stagingObjectId: '22222222-2222-4222-8222-222222222222',
  })

  assert.equal(key.stagingObjectId, '22222222-2222-4222-8222-222222222222')
  assert.equal(
    key.objectKey,
    '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222',
  )
})
