import assert from 'node:assert/strict'
import test from 'node:test'

import { validateRestoreDrillEvidenceInput } from './restore-evidence-rules'

test('validateRestoreDrillEvidenceInput requires storage target id for verified evidence', () => {
  assert.equal(
    validateRestoreDrillEvidenceInput({
      assetId: 'asset-1',
      candidateStatus: 'ready',
      checksumSha256: 'a'.repeat(64),
      evidenceStatus: 'verified',
      summary: 'Restored sample was verified.',
    }),
    'Verified restore evidence requires a storage target id.',
  )
})

test('validateRestoreDrillEvidenceInput requires checksum for verified evidence', () => {
  assert.equal(
    validateRestoreDrillEvidenceInput({
      assetId: 'asset-1',
      candidateStatus: 'ready',
      evidenceStatus: 'verified',
      storageTargetId: 'target-1',
      summary: 'Restored sample was verified.',
    }),
    'Verified restore evidence requires a checksum.',
  )
})

test('validateRestoreDrillEvidenceInput allows blocked evidence without placement material', () => {
  assert.equal(
    validateRestoreDrillEvidenceInput({
      assetId: 'asset-1',
      candidateStatus: 'blocked',
      evidenceStatus: 'blocked',
      safeErrorClass: 'missing_restore_source',
      summary: 'Restore source is unavailable.',
    }),
    null,
  )
})
