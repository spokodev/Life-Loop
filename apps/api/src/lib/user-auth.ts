import { createClerkClient, verifyToken } from '@clerk/backend'
import type { ApiEnv } from '@life-loop/config'
import type { OwnerIdentityInput } from '@life-loop/shared-types'

import { parseBearerToken } from './bearer-token'

type ClerkClaims = Record<string, unknown>

type VerifyClerkToken = (
  token: string,
  options: {
    authorizedParties?: string[]
    secretKey: string
  },
) => Promise<ClerkClaims>

type FetchClerkUserActor = (
  clerkUserId: string,
  env: Pick<ApiEnv, 'CLERK_SECRET_KEY'>,
) => Promise<OwnerIdentityInput>

type ResolveUserActorInput = {
  authorizationHeader?: string | null | undefined
  bootstrapActor?: OwnerIdentityInput
  env: Pick<ApiEnv, 'authEnabled' | 'CLERK_ISSUER_URL' | 'CLERK_SECRET_KEY' | 'CORS_ORIGIN'>
  fetchClerkUserActor?: FetchClerkUserActor
  verifyClerkToken?: VerifyClerkToken
}

export class UserAuthError extends Error {
  readonly status: 401 | 403 | 500
  readonly title: string

  constructor(input: { detail: string; status: 401 | 403 | 500; title: string }) {
    super(input.detail)
    this.name = 'UserAuthError'
    this.status = input.status
    this.title = input.title
  }
}

export async function resolveUserActor({
  authorizationHeader,
  bootstrapActor,
  env,
  fetchClerkUserActor = fetchClerkUserActorFromApi,
  verifyClerkToken = verifyClerkSessionToken,
}: ResolveUserActorInput): Promise<OwnerIdentityInput | undefined> {
  if (!env.authEnabled) {
    return bootstrapActor
  }

  const token = parseBearerToken(authorizationHeader)

  if (!token) {
    throw new UserAuthError({
      title: 'Authorization required',
      status: 401,
      detail: 'User-owned write requests must include a Bearer Clerk session token.',
    })
  }

  if (!env.CLERK_ISSUER_URL || !env.CLERK_SECRET_KEY) {
    throw new UserAuthError({
      title: 'Auth configuration invalid',
      status: 500,
      detail: 'API auth is enabled but Clerk issuer or secret configuration is missing.',
    })
  }

  let claims: ClerkClaims

  try {
    claims = await verifyClerkToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      ...authorizedPartiesFromCorsOrigin(env.CORS_ORIGIN),
    })
  } catch {
    throw new UserAuthError({
      title: 'Clerk authentication failed',
      status: 401,
      detail: 'The Clerk session token could not be verified.',
    })
  }

  const clerkUserId = readRequiredStringClaim(claims, 'sub')
  const issuer = readRequiredStringClaim(claims, 'iss')

  if (issuer !== env.CLERK_ISSUER_URL) {
    throw new UserAuthError({
      title: 'Clerk authentication failed',
      status: 401,
      detail: 'The Clerk session token issuer does not match the configured Clerk issuer.',
    })
  }

  return fetchClerkUserActor(clerkUserId, env)
}

async function verifyClerkSessionToken(
  token: string,
  options: {
    authorizedParties?: string[]
    secretKey: string
  },
) {
  return verifyToken(token, options)
}

async function fetchClerkUserActorFromApi(
  clerkUserId: string,
  env: Pick<ApiEnv, 'CLERK_SECRET_KEY'>,
): Promise<OwnerIdentityInput> {
  if (!env.CLERK_SECRET_KEY) {
    throw new UserAuthError({
      title: 'Auth configuration invalid',
      status: 500,
      detail: 'CLERK_SECRET_KEY is required to load the authenticated Clerk user profile.',
    })
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
  const user = await clerk.users.getUser(clerkUserId)
  const primaryEmailAddress = user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
  )?.emailAddress

  if (!primaryEmailAddress) {
    throw new UserAuthError({
      title: 'Clerk identity incomplete',
      status: 403,
      detail: 'The authenticated Clerk user must have a primary email address.',
    })
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()

  return {
    clerkUserId,
    email: primaryEmailAddress,
    ...(displayName ? { displayName } : user.username ? { displayName: user.username } : {}),
  }
}

function readRequiredStringClaim(claims: ClerkClaims, claimName: 'iss' | 'sub') {
  const value = claims[claimName]

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
  }

  throw new UserAuthError({
    title: 'Clerk authentication failed',
    status: 401,
    detail: `The Clerk session token is missing the required ${claimName} claim.`,
  })
}

function authorizedPartiesFromCorsOrigin(corsOrigin: string) {
  const authorizedParties = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== '*')

  return authorizedParties.length > 0 ? { authorizedParties } : {}
}
