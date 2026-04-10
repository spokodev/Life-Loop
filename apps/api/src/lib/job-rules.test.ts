import assert from 'node:assert/strict'
import test from 'node:test'

import type { JobRun } from '@life-loop/shared-types'

import { mapRestoreDrillFromStatus, validateJobTransition } from './job-rules'

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

test('mapRestoreDrillFromStatus maps completed_with_warnings to passed with notes', () => {
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

  assert.equal(mapped.status, 'passed')
  assert.equal(mapped.notes, 'One source path required manual remapping.')
  assert.ok(mapped.completedAt)
})
