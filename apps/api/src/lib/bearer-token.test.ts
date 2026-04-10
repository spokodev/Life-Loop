import assert from 'node:assert/strict'
import test from 'node:test'

import { parseBearerToken } from './bearer-token'

test('parseBearerToken extracts a non-empty bearer token', () => {
  assert.equal(parseBearerToken('Bearer credential.secret'), 'credential.secret')
  assert.equal(parseBearerToken('Bearer   credential.secret  '), 'credential.secret')
})

test('parseBearerToken rejects missing or unsupported authorization schemes', () => {
  assert.equal(parseBearerToken(undefined), null)
  assert.equal(parseBearerToken(null), null)
  assert.equal(parseBearerToken(''), null)
  assert.equal(parseBearerToken('Basic credential.secret'), null)
  assert.equal(parseBearerToken('Bearer   '), null)
})
