import assert from 'node:assert/strict'
import test from 'node:test'

import { assetLifecycleStates, storageRoles } from './lifecycle'

test('lifecycle vocabulary preserves safety-critical states', () => {
  assert.ok(assetLifecycleStates.includes('safe_archived'))
  assert.ok(assetLifecycleStates.includes('cleanup_eligible'))
  assert.ok(storageRoles.includes('archive-primary'))
  assert.ok(storageRoles.includes('archive-replica'))
})
