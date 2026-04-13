import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import test, { after, before } from 'node:test'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgres://lifeloop:lifeloop@localhost:5434/lifeloop'
process.env.HOSTED_STAGING_ROOT ??= '/tmp/life-loop-hosted-staging-db-test'
process.env.CLERK_ISSUER_URL = ''
process.env.CLERK_SECRET_KEY = ''
process.env.STRIPE_SECRET_KEY = ''
process.env.STRIPE_WEBHOOK_SECRET = ''
process.env.STRIPE_CHECKOUT_PRICE_ID = ''
process.env.STRIPE_CHECKOUT_SUCCESS_URL = ''
process.env.STRIPE_CHECKOUT_CANCEL_URL = ''
process.env.STRIPE_PORTAL_RETURN_URL = ''

const { app } = await import('../app')
const { closeDatabasePool, getDatabasePool } = await import('../db/client')

const runId = randomUUID()
const primaryOwnerEmail = `job-claims-primary-${runId}@example.test`
const secondaryOwnerEmail = `job-claims-secondary-${runId}@example.test`
const primaryLibrarySlug = `job-claims-primary-${runId}`
const secondaryLibrarySlug = `job-claims-secondary-${runId}`

before(async () => {
  await runMigrations()
})

after(async () => {
  const pool = getDatabasePool()
  await pool.query('delete from libraries where slug = any($1::text[])', [
    [primaryLibrarySlug, secondaryLibrarySlug],
  ])
  await pool.query('delete from users where email = any($1::text[])', [
    [primaryOwnerEmail, secondaryOwnerEmail],
  ])
  await closeDatabasePool()
})

test('job claims are unique, lease-scoped, recoverable, and device-library scoped', async () => {
  const primaryLibrary = await createLibrary(primaryOwnerEmail, primaryLibrarySlug)
  const secondaryLibrary = await createLibrary(secondaryOwnerEmail, secondaryLibrarySlug)
  const firstDevice = await createAndRedeemDevice(
    primaryLibrary.id,
    primaryOwnerEmail,
    'first job claim device',
  )
  const secondDevice = await createAndRedeemDevice(
    primaryLibrary.id,
    primaryOwnerEmail,
    'second job claim device',
  )
  const otherLibraryDevice = await createAndRedeemDevice(
    secondaryLibrary.id,
    secondaryOwnerEmail,
    'other library job claim device',
  )
  await Promise.all([
    recordHeartbeat(firstDevice.credential.token),
    recordHeartbeat(secondDevice.credential.token),
    recordHeartbeat(otherLibraryDevice.credential.token),
  ])

  const duplicateJob = await createJob(primaryLibrary.id, primaryOwnerEmail, 'archive-placement')
  const duplicateClaims = await Promise.all([
    claimJobs(firstDevice.credential.token, ['archive-placement']),
    claimJobs(firstDevice.credential.token, ['archive-placement']),
  ])
  const claimedIds = duplicateClaims.flatMap((response) =>
    response.claim ? [response.claim.job.id] : [],
  )
  assert.deepEqual(claimedIds, [duplicateJob.id])
  assert.equal(duplicateClaims.filter((response) => response.claim).length, 1)

  const wrongLeaseCompletion = await requestJson(`/v1/jobs/${duplicateJob.id}/claims/complete`, {
    body: {
      leaseToken: 'wrong-lease-token-with-enough-length',
      status: 'succeeded',
    },
    credential: firstDevice.credential.token,
    method: 'POST',
  })
  assert.equal(wrongLeaseCompletion.status, 401)

  const warningWithoutReason = await requestJson(`/v1/jobs/${duplicateJob.id}/claims/complete`, {
    body: {
      leaseToken: duplicateClaims.find((response) => response.claim)?.claim?.lease.leaseToken,
      status: 'completed_with_warnings',
    },
    credential: firstDevice.credential.token,
    method: 'POST',
  })
  assert.equal(warningWithoutReason.status, 422)

  const scopedJob = await createJob(
    primaryLibrary.id,
    primaryOwnerEmail,
    'placement-verification',
    secondDevice.device.id,
  )
  const firstDeviceScopedClaim = await claimJobs(firstDevice.credential.token, [
    'placement-verification',
  ])
  assert.equal(firstDeviceScopedClaim.claim, undefined)
  const secondDeviceScopedClaim = await claimJobs(secondDevice.credential.token, [
    'placement-verification',
  ])
  assert.equal(secondDeviceScopedClaim.claim?.job.id, scopedJob.id)

  const otherLibraryJob = await createJob(secondaryLibrary.id, secondaryOwnerEmail, 'replica-sync')
  const crossLibraryClaim = await claimJobs(firstDevice.credential.token, ['replica-sync'])
  assert.equal(crossLibraryClaim.claim, undefined)
  const sameLibraryClaim = await claimJobs(otherLibraryDevice.credential.token, ['replica-sync'])
  assert.equal(sameLibraryClaim.claim?.job.id, otherLibraryJob.id)

  const terminalJob = await createJob(primaryLibrary.id, primaryOwnerEmail, 'cleanup-review')
  await transitionJob(terminalJob.id, primaryOwnerEmail, 'failed', 'Terminal test failure.')
  const terminalClaim = await claimJobs(firstDevice.credential.token, ['cleanup-review'])
  assert.equal(terminalClaim.claim, undefined)

  const recoverableJob = await createJob(primaryLibrary.id, primaryOwnerEmail, 'replica-sync')
  const recoverableClaim = await claimJobs(firstDevice.credential.token, ['replica-sync'])
  assert.equal(recoverableClaim.claim?.job.id, recoverableJob.id)
  await getDatabasePool().query(
    `update job_runs set lease_expires_at = now() - interval '1 minute' where id = $1::uuid`,
    [recoverableJob.id],
  )

  const recoveredClaim = await claimJobs(secondDevice.credential.token, ['replica-sync'])
  assert.equal(recoveredClaim.recoveredExpiredCount, 1)
  assert.equal(recoveredClaim.claim?.job.id, recoverableJob.id)
  assert.equal(recoveredClaim.claim.job.attemptCount, 1)

  const restoreDrillCreate = await postJson<{
    job: { id: string }
    restoreDrill: { id: string }
  }>('/v1/jobs', {
    execution: {
      schemaVersion: 1,
      operation: 'restore-drill',
      samples: [
        {
          assetId: randomUUID(),
          candidateStatus: 'ready',
          source: {
            storageTargetId: 'target-1',
            provider: 'local-disk',
            relativePath: '2026/04/original.bin',
            checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
        },
      ],
    },
    kind: 'restore-drill',
    libraryId: primaryLibrary.id,
    requestedBy: {
      email: primaryOwnerEmail,
    },
  })
  const restoreDrillClaim = await claimJobs(firstDevice.credential.token, ['restore-drill'])
  assert.equal(restoreDrillClaim.claim?.job.id, restoreDrillCreate.job.id)
  assert.equal(
    restoreDrillClaim.claim.execution?.restoreDrillId,
    restoreDrillCreate.restoreDrill.id,
  )
})

async function createLibrary(ownerEmail: string, slug: string) {
  const { library } = await postJson<{ library: { id: string } }>('/v1/libraries', {
    library: {
      name: `Job Claims ${slug}`,
      slug,
      topology: 'local-first',
    },
    owner: {
      email: ownerEmail,
      displayName: `Job Claims ${slug}`,
    },
  })

  return library
}

async function createAndRedeemDevice(libraryId: string, ownerEmail: string, name: string) {
  const enrollment = await postJson<{
    device: { id: string }
    enrollmentToken: { token: string }
  }>('/v1/devices', {
    device: {
      name,
      platform: 'macos',
    },
    libraryId,
    requestedBy: {
      email: ownerEmail,
    },
  })

  return postJson<{
    credential: { token: string }
    device: { id: string }
  }>('/v1/device-auth/redeem', {
    enrollmentToken: enrollment.enrollmentToken.token,
  })
}

async function createJob(libraryId: string, ownerEmail: string, kind: string, deviceId?: string) {
  const { job } = await postJson<{ job: { id: string } }>('/v1/jobs', {
    ...(deviceId ? { deviceId } : {}),
    kind,
    libraryId,
    requestedBy: {
      email: ownerEmail,
    },
  })

  return job
}

async function claimJobs(credential: string, kinds: string[]) {
  return postJson<{
    claim?: {
      job: {
        attemptCount: number
        id: string
      }
      execution?: {
        operation: string
        restoreDrillId?: string
      }
      lease: {
        leaseToken: string
      }
    }
    recoveredExpiredCount: number
  }>(
    '/v1/jobs/claims',
    {
      kinds,
      leaseSeconds: 300,
    },
    {
      credential,
    },
  )
}

async function transitionJob(jobId: string, ownerEmail: string, status: string, reason: string) {
  await postJson(`/v1/jobs/${jobId}/transitions`, {
    reason,
    requestedBy: {
      email: ownerEmail,
    },
    status,
  })
}

async function recordHeartbeat(credential: string) {
  await postJson(
    '/v1/device-auth/heartbeat',
    {
      observedAt: new Date().toISOString(),
    },
    {
      credential,
    },
  )
}

async function postJson<TResponse>(
  pathname: string,
  body: unknown,
  options: { credential?: string; headers?: Record<string, string> } = {},
) {
  const result = await requestJson(pathname, {
    body,
    ...(options.credential ? { credential: options.credential } : {}),
    ...(options.headers ? { headers: options.headers } : {}),
    method: 'POST',
  })
  const text = await result.response.text()

  assert.equal(result.status >= 200 && result.status < 300, true, text)
  return JSON.parse(text) as TResponse
}

async function requestJson(
  pathname: string,
  input: {
    body?: unknown
    credential?: string
    headers?: Record<string, string>
    method: 'POST'
  },
) {
  const headers = new Headers(input.headers)

  if (input.credential) {
    headers.set('Authorization', `Bearer ${input.credential}`)
  }

  headers.set('Content-Type', 'application/json')

  const response = await app.request(`http://localhost${pathname}`, {
    body: JSON.stringify(input.body),
    headers,
    method: input.method,
  })

  return {
    response,
    status: response.status,
  }
}

async function runMigrations() {
  const migrationsDirectory = new URL('../db/migrations/', import.meta.url)
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort()
  const pool = getDatabasePool()

  for (const migrationFile of migrationFiles) {
    const sql = await readFile(new URL(migrationFile, migrationsDirectory), 'utf8')
    await pool.query(sql)
  }
}
