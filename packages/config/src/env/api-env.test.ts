import assert from 'node:assert/strict'
import test from 'node:test'

import { parseApiEnv } from './api-env'

test('parseApiEnv enables auth only when Clerk issuer is set', () => {
  const env = parseApiEnv({
    DATABASE_URL: 'postgres://lifeloop:lifeloop@localhost:5434/lifeloop',
  })

  assert.equal(env.authEnabled, false)
  assert.equal(env.API_PORT, 4000)
})
