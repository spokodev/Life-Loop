import assert from 'node:assert/strict'
import test from 'node:test'

import type { JobRun } from '@life-loop/shared-types'

import {
  mapRestoreDrillFromStatus,
  validateCreateJobInput,
  validateJobTransition,
} from './job-rules'

const baseJob: JobRun = {
  id: 'job-1',
  kind: 'restore-drill',
  status: 'running',
  correlationId: '7d763db2-cb92-46fe-baf6-807dddb55c49',
  attemptCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

test('validateJobTransition requires a reason for blocked status', () => {
  const validationMessage = validateJobTransition(baseJob, {
    status: 'blocked',
  })

  assert.equal(validationMessage, 'A reason is required when transitioning a job to blocked.')
})

test('validateJobTransition requires a reason for failed status', () => {
  const validationMessage = validateJobTransition(baseJob, {
    status: 'failed',
  })

  assert.equal(validationMessage, 'A reason is required when transitioning a job to failed.')
})

test('validateJobTransition requires a warning summary for completed_with_warnings', () => {
  const validationMessage = validateJobTransition(baseJob, {
    status: 'completed_with_warnings',
  })

  assert.equal(
    validationMessage,
    'A warning summary is required when transitioning a job to completed_with_warnings.',
  )
})

test('validateJobTransition rejects reopening a terminal job', () => {
  const validationMessage = validateJobTransition(
    {
      ...baseJob,
      status: 'succeeded',
    },
    {
      status: 'running',
    },
  )

  assert.equal(validationMessage, 'Job job-1 is already terminal with status succeeded.')
})

test('mapRestoreDrillFromStatus does not pass restore drills from job status alone', () => {
  const mapped = mapRestoreDrillFromStatus(
    {
      id: 'drill-1',
      libraryId: 'library-1',
      status: 'running',
      sampleSize: 12,
      startedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      status: 'completed_with_warnings',
      reason: 'One source path required manual remapping.',
    },
  )

  assert.equal(mapped.status, 'running')
  assert.equal(mapped.notes, 'One source path required manual remapping.')
  assert.equal(mapped.completedAt, undefined)
})

test('validateCreateJobInput accepts a safe hosted-staging archive execution manifest', () => {
  const validationMessage = validateCreateJobInput({
    libraryId: '179a1414-2f59-410d-a32d-c9d27c7623ab',
    kind: 'archive-placement',
    execution: {
      schemaVersion: 1,
      operation: 'archive-placement',
      storageTargetId: 'target-1',
      provider: 'local-disk',
      relativePath: '2026/04/original.bin',
      checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sizeBytes: 128,
      source: {
        kind: 'hosted-staging',
        stagingObjectId: '13bcfd33-d477-4c52-943e-25ef423fbf67',
      },
    },
  })

  assert.equal(validationMessage, null)
})

test('validateCreateJobInput rejects archive execution without a source', () => {
  const validationMessage = validateCreateJobInput({
    libraryId: '179a1414-2f59-410d-a32d-c9d27c7623ab',
    kind: 'archive-placement',
    execution: {
      schemaVersion: 1,
      operation: 'archive-placement',
      storageTargetId: 'target-1',
      provider: 'local-disk',
      relativePath: '2026/04/original.bin',
      checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  })

  assert.equal(
    validationMessage,
    'Archive-placement execution manifests require a source reference.',
  )
})

test('validateCreateJobInput rejects unsafe execution relative paths', () => {
  const validationMessage = validateCreateJobInput({
    libraryId: '179a1414-2f59-410d-a32d-c9d27c7623ab',
    kind: 'placement-verification',
    execution: {
      schemaVersion: 1,
      operation: 'placement-verification',
      storageTargetId: 'target-1',
      provider: 'local-disk',
      relativePath: '../escape.bin',
      checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  })

  assert.equal(
    validationMessage,
    'Execution manifest relative path must stay within the storage target root.',
  )
})

test('validateCreateJobInput rejects hosted-staging source without staging object id', () => {
  const validationMessage = validateCreateJobInput({
    libraryId: '179a1414-2f59-410d-a32d-c9d27c7623ab',
    kind: 'archive-placement',
    execution: {
      schemaVersion: 1,
      operation: 'archive-placement',
      storageTargetId: 'target-1',
      provider: 'local-disk',
      relativePath: '2026/04/original.bin',
      checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      source: {
        kind: 'hosted-staging',
      },
    },
  })

  assert.equal(validationMessage, 'Hosted-staging execution manifests require a staging object id.')
})
