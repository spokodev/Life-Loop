import assert from 'node:assert/strict'
import test from 'node:test'

import { parseApiEnv } from './api-env'

test('parseApiEnv enables auth only when Clerk issuer is set', () => {
  const env = parseApiEnv({
    CLERK_ISSUER_URL: '',
    CLERK_SECRET_KEY: '',
    DATABASE_URL: 'postgres://lifeloop:lifeloop@localhost:5434/lifeloop',
  })

  assert.equal(env.authEnabled, false)
  assert.equal(env.API_PORT, 4000)
  assert.equal(env.CLERK_ISSUER_URL, undefined)
  assert.equal(env.CLERK_SECRET_KEY, undefined)
  assert.equal(env.DEVICE_HEARTBEAT_STALE_AFTER_SECONDS, 120)
  assert.equal(env.billingEnabled, false)
})

test('parseApiEnv requires Clerk secret when API auth is enabled', () => {
  assert.throws(() =>
    parseApiEnv({
      CLERK_ISSUER_URL: 'https://example.clerk.accounts.dev',
      CLERK_SECRET_KEY: '',
      DATABASE_URL: 'postgres://lifeloop:lifeloop@localhost:5434/lifeloop',
    }),
  )

  const env = parseApiEnv({
    CLERK_ISSUER_URL: 'https://example.clerk.accounts.dev',
    CLERK_SECRET_KEY: 'sk_test_example',
    DATABASE_URL: 'postgres://lifeloop:lifeloop@localhost:5434/lifeloop',
  })

  assert.equal(env.authEnabled, true)
  assert.equal(env.CLERK_SECRET_KEY, 'sk_test_example')
})

test('parseApiEnv requires complete Stripe billing configuration when any Stripe key is set', () => {
  assert.throws(() =>
    parseApiEnv({
      DATABASE_URL: 'postgres://lifeloop:lifeloop@localhost:5434/lifeloop',
      STRIPE_SECRET_KEY: 'sk_test_example',
    }),
  )

  const env = parseApiEnv({
    DATABASE_URL: 'postgres://lifeloop:lifeloop@localhost:5434/lifeloop',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_example',
    STRIPE_CHECKOUT_PRICE_ID: 'price_example',
    STRIPE_CHECKOUT_SUCCESS_URL: 'http://localhost:3000/settings?checkout=success',
    STRIPE_CHECKOUT_CANCEL_URL: 'http://localhost:3000/settings?checkout=cancelled',
    STRIPE_PORTAL_RETURN_URL: 'http://localhost:3000/settings',
  })

  assert.equal(env.billingEnabled, true)
  assert.equal(env.STRIPE_CHECKOUT_PRICE_ID, 'price_example')
})
