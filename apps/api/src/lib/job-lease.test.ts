import assert from 'node:assert/strict'
import test from 'node:test'

import { generateJobLeaseToken, hashJobLeaseToken, verifyJobLeaseToken } from './job-lease'

test('generateJobLeaseToken creates verifiable opaque tokens', () => {
  const token = generateJobLeaseToken()
  const tokenHash = hashJobLeaseToken(token)

  assert.ok(token.length >= 32)
  assert.equal(verifyJobLeaseToken(token, tokenHash), true)
  assert.equal(verifyJobLeaseToken('wrong-token', tokenHash), false)
})

test('verifyJobLeaseToken rejects missing hashes', () => {
  assert.equal(verifyJobLeaseToken('token', null), false)
  assert.equal(verifyJobLeaseToken('token', undefined), false)
})
