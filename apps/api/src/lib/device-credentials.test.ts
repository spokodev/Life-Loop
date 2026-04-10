import assert from 'node:assert/strict'
import test from 'node:test'

import {
  composeDeviceCredential,
  hashDeviceSecret,
  parseDeviceCredential,
} from './device-credentials'

test('parseDeviceCredential extracts the credential id and secret', () => {
  const parsed = parseDeviceCredential(composeDeviceCredential('cred-123', 'secret-abc'))

  assert.deepEqual(parsed, {
    credentialId: 'cred-123',
    secret: 'secret-abc',
  })
})

test('parseDeviceCredential rejects malformed values', () => {
  assert.throws(() => parseDeviceCredential('missing-separator'))
  assert.throws(() => parseDeviceCredential('.missing-id'))
  assert.throws(() => parseDeviceCredential('missing-secret.'))
})

test('hashDeviceSecret is deterministic', () => {
  assert.equal(hashDeviceSecret('secret-abc'), hashDeviceSecret('secret-abc'))
  assert.notEqual(hashDeviceSecret('secret-abc'), hashDeviceSecret('secret-def'))
})
