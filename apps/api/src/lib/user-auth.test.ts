import assert from 'node:assert/strict'
import test from 'node:test'

import type { OwnerIdentityInput } from '@life-loop/shared-types'

import { resolveUserActor, UserAuthError } from './user-auth'

const authEnabledEnv = {
  authEnabled: true,
  CLERK_ISSUER_URL: 'https://example.clerk.accounts.dev',
  CLERK_SECRET_KEY: 'sk_test_example',
  CORS_ORIGIN: 'http://localhost:3000',
}

test('resolveUserActor preserves explicit bootstrap actor while API auth is disabled', async () => {
  const bootstrapActor: OwnerIdentityInput = {
    email: 'owner@example.com',
    clerkUserId: 'bootstrap-user',
  }

  const actor = await resolveUserActor({
    env: {
      authEnabled: false,
      CORS_ORIGIN: 'http://localhost:3000',
    },
    bootstrapActor,
    verifyClerkToken: async () => {
      throw new Error('Verifier must not run in bootstrap mode.')
    },
  })

  assert.deepEqual(actor, bootstrapActor)
})

test('resolveUserActor rejects auth-enabled requests without a Clerk bearer token', async () => {
  await assert.rejects(
    () =>
      resolveUserActor({
        env: authEnabledEnv,
      }),
    (error) =>
      error instanceof UserAuthError &&
      error.status === 401 &&
      error.message.includes('Bearer Clerk session token'),
  )
})

test('resolveUserActor derives the actor from Clerk and ignores body-provided identity', async () => {
  const actor = await resolveUserActor({
    authorizationHeader: 'Bearer clerk-session-token',
    bootstrapActor: {
      email: 'spoofed@example.com',
      clerkUserId: 'spoofed-user',
    },
    env: authEnabledEnv,
    verifyClerkToken: async (token, options) => {
      assert.equal(token, 'clerk-session-token')
      assert.equal(options.secretKey, 'sk_test_example')
      assert.deepEqual(options.authorizedParties, ['http://localhost:3000'])

      return {
        iss: 'https://example.clerk.accounts.dev',
        sub: 'user_clerk_123',
      }
    },
    fetchClerkUserActor: async (clerkUserId) => ({
      clerkUserId,
      email: 'owner@example.com',
      displayName: 'Life Loop Owner',
    }),
  })

  assert.deepEqual(actor, {
    clerkUserId: 'user_clerk_123',
    email: 'owner@example.com',
    displayName: 'Life Loop Owner',
  })
})

test('resolveUserActor rejects Clerk tokens from the wrong issuer', async () => {
  await assert.rejects(
    () =>
      resolveUserActor({
        authorizationHeader: 'Bearer clerk-session-token',
        env: authEnabledEnv,
        verifyClerkToken: async () => ({
          iss: 'https://other.clerk.accounts.dev',
          sub: 'user_clerk_123',
        }),
        fetchClerkUserActor: async () => {
          throw new Error('Profile fetch must not run after issuer mismatch.')
        },
      }),
    (error) =>
      error instanceof UserAuthError &&
      error.status === 401 &&
      error.message.includes('issuer does not match'),
  )
})

test('resolveUserActor does not accept device credentials as user auth', async () => {
  await assert.rejects(
    () =>
      resolveUserActor({
        authorizationHeader: 'Bearer device-credential-id.device-secret',
        env: authEnabledEnv,
        verifyClerkToken: async () => {
          throw new Error('not a Clerk JWT')
        },
      }),
    (error) =>
      error instanceof UserAuthError &&
      error.status === 401 &&
      error.message.includes('could not be verified'),
  )
})
