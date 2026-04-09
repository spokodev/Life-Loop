import assert from 'node:assert/strict'
import test from 'node:test'

import { app } from './app'

test('GET /health/live returns ok', async () => {
  const response = await app.request('http://localhost/health/live')
  const payload = (await response.json()) as { status: string }

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'ok')
})
