import type { RecordRestoreDrillEvidenceInput } from '@life-loop/shared-types'

export function validateRestoreDrillEvidenceInput(input: RecordRestoreDrillEvidenceInput) {
  if (input.evidenceStatus !== 'verified') {
    return null
  }

  if (!input.storageTargetId) {
    return 'Verified restore evidence requires a storage target id.'
  }

  if (!input.checksumSha256) {
    return 'Verified restore evidence requires a checksum.'
  }

  return null
}
