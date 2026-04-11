import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after, before } from 'node:test'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgres://lifeloop:lifeloop@localhost:5434/lifeloop'

const stagingRoot = await mkdtemp(path.join(tmpdir(), 'life-loop-hosted-staging-db-test-'))
process.env.HOSTED_STAGING_ROOT = stagingRoot
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
const ownerEmail = `hosted-staging-${runId}@example.test`
const librarySlug = `hosted-staging-${runId}`

before(async () => {
  await runMigrations()
})

after(async () => {
  const pool = getDatabasePool()
  await pool.query('delete from libraries where slug = $1', [librarySlug])
  await pool.query('delete from users where email = $1', [ownerEmail])
  await closeDatabasePool()
  await rm(stagingRoot, { force: true, recursive: true })
})

test('hosted-staging archive handoff is claim scoped and keeps upload separate from archive safety', async () => {
  const content = Buffer.from('hosted staging archive smoke bytes')
  const checksum = sha256(content)

  const { library } = await postJson<{ library: { id: string } }>('/v1/libraries', {
    library: {
      name: 'Hosted Staging Smoke Library',
      slug: librarySlug,
      topology: 'local-first',
    },
    owner: {
      email: ownerEmail,
      displayName: 'Hosted Staging Smoke',
    },
  })

  const iosCredential = await createAndRedeemDevice(library.id, 'ios')
  const desktopCredential = await createAndRedeemDevice(library.id, 'macos')
  await recordHeartbeat(iosCredential.credential.token)
  await recordHeartbeat(desktopCredential.credential.token)
  const { storageTarget } = await postJson<{ storageTarget: { id: string } }>(
    '/v1/storage-targets',
    {
      libraryId: library.id,
      requestedBy: {
        email: ownerEmail,
      },
      storageTarget: {
        name: 'Smoke archive primary',
        provider: 'local-disk',
        role: 'archive-primary',
        writable: true,
      },
    },
  )

  const staged = await stageObject({
    checksum,
    content,
    credential: iosCredential.credential.token,
    libraryId: library.id,
  })

  const { job } = await postJson<{ job: { id: string } }>('/v1/jobs', {
    deviceId: desktopCredential.device.id,
    execution: {
      schemaVersion: 1,
      operation: 'archive-placement',
      storageTargetId: storageTarget.id,
      provider: 'local-disk',
      relativePath: '2026/04/original.bin',
      checksumSha256: checksum,
      sizeBytes: content.byteLength,
      source: {
        kind: 'hosted-staging',
        stagingObjectId: staged.id,
      },
    },
    kind: 'archive-placement',
    libraryId: library.id,
    requestedBy: {
      email: ownerEmail,
    },
  })

  const claim = await claimArchiveJob(desktopCredential.credential.token)
  assert.equal(claim.claim.job.id, job.id)
  assert.equal(claim.claim.execution.source.stagingObjectId, staged.id)

  const wrongLeaseResponse = await requestJson(
    `/v1/jobs/${job.id}/sources/hosted-staging/${staged.id}`,
    {
      body: {
        leaseToken: 'wrong-lease-token-with-enough-length',
      },
      credential: desktopCredential.credential.token,
      method: 'POST',
    },
  )
  assert.equal(wrongLeaseResponse.status, 401)

  const fetchResponse = await requestJson(
    `/v1/jobs/${job.id}/sources/hosted-staging/${staged.id}`,
    {
      body: {
        leaseToken: claim.claim.lease.leaseToken,
      },
      credential: desktopCredential.credential.token,
      method: 'POST',
    },
  )
  assert.equal(fetchResponse.status, 200)
  assert.equal(fetchResponse.response.headers.get('cache-control'), 'no-store')
  assert.equal(fetchResponse.response.headers.get('x-life-loop-checksum-sha256'), checksum)
  assert.deepEqual(Buffer.from(await fetchResponse.response.arrayBuffer()), content)

  const stagedStatus = await readHostedStagingStatus(staged.id)
  assert.equal(stagedStatus, 'archiving')

  const ingest = await postJson<{ asset: { lifecycleState: string }; job: { status: string } }>(
    '/v1/assets/report-ingest',
    {
      blobs: [
        {
          checksumSha256: checksum,
          kind: 'original',
          mimeType: 'application/octet-stream',
          sizeBytes: content.byteLength,
        },
      ],
      filename: 'original.bin',
      libraryId: library.id,
      placements: [
        {
          blobKind: 'original',
          checksumSha256: checksum,
          healthState: 'healthy',
          role: 'archive-primary',
          storageTargetId: storageTarget.id,
          verified: true,
        },
      ],
    },
    {
      credential: desktopCredential.credential.token,
      headers: {
        'Idempotency-Key': `smoke-ingest-${runId}`,
      },
    },
  )
  assert.equal(ingest.asset.lifecycleState, 'archived_primary_verified')
  assert.equal(ingest.job.status, 'completed_with_warnings')

  await completeClaim(desktopCredential.credential.token, job.id, claim.claim.lease.leaseToken)

  const expired = await stageObject({
    checksum,
    content,
    credential: iosCredential.credential.token,
    libraryId: library.id,
  })
  const { job: expiredJob } = await postJson<{ job: { id: string } }>('/v1/jobs', {
    deviceId: desktopCredential.device.id,
    execution: {
      schemaVersion: 1,
      operation: 'archive-placement',
      storageTargetId: storageTarget.id,
      provider: 'local-disk',
      relativePath: '2026/04/expired.bin',
      checksumSha256: checksum,
      sizeBytes: content.byteLength,
      source: {
        kind: 'hosted-staging',
        stagingObjectId: expired.id,
      },
    },
    kind: 'archive-placement',
    libraryId: library.id,
    requestedBy: {
      email: ownerEmail,
    },
  })
  const expiredClaim = await claimArchiveJob(desktopCredential.credential.token)
  assert.equal(expiredClaim.claim.job.id, expiredJob.id)
  await getDatabasePool().query(
    `update hosted_staging_objects set expires_at = now() - interval '1 minute' where id = $1::uuid`,
    [expired.id],
  )

  const expiredResponse = await requestJson(
    `/v1/jobs/${expiredJob.id}/sources/hosted-staging/${expired.id}`,
    {
      body: {
        leaseToken: expiredClaim.claim.lease.leaseToken,
      },
      credential: desktopCredential.credential.token,
      method: 'POST',
    },
  )
  assert.equal(expiredResponse.status, 409)
  assert.match(await expiredResponse.response.text(), /Hosted staging object has expired/)
})

async function createAndRedeemDevice(libraryId: string, platform: 'ios' | 'macos') {
  const enrollment = await postJson<{
    device: { id: string }
    enrollmentToken: { token: string }
  }>('/v1/devices', {
    device: {
      name: `${platform} smoke device`,
      platform,
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

async function stageObject(input: {
  checksum: string
  content: Buffer
  credential: string
  libraryId: string
}) {
  const reservation = await postJson<{
    stagingObject: { id: string }
    upload: { url: string }
  }>(
    '/v1/mobile/staging/reservations',
    {
      checksumSha256: input.checksum,
      contentType: 'application/octet-stream',
      filename: 'original.bin',
      libraryId: input.libraryId,
      sizeBytes: input.content.byteLength,
    },
    {
      credential: input.credential,
    },
  )

  await requestJson(new URL(reservation.upload.url).pathname, {
    body: input.content,
    credential: input.credential,
    method: 'PUT',
  }).then((result) => assert.equal(result.status, 201))

  return reservation.stagingObject
}

async function claimArchiveJob(credential: string) {
  return postJson<{
    claim: {
      execution: { source: { stagingObjectId: string } }
      job: { id: string }
      lease: { leaseToken: string }
    }
  }>(
    '/v1/jobs/claims',
    {
      kinds: ['archive-placement'],
      leaseSeconds: 300,
    },
    {
      credential,
    },
  )
}

async function completeClaim(credential: string, jobId: string, leaseToken: string) {
  await postJson(
    `/v1/jobs/${jobId}/claims/complete`,
    {
      leaseToken,
      status: 'succeeded',
    },
    {
      credential,
    },
  )
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

async function readHostedStagingStatus(stagingObjectId: string) {
  const result = await getDatabasePool().query<{ status: string }>(
    'select status from hosted_staging_objects where id = $1::uuid',
    [stagingObjectId],
  )

  return result.rows[0]?.status
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
    body?: Buffer | unknown
    credential?: string
    headers?: Record<string, string>
    method: 'GET' | 'POST' | 'PUT'
  },
) {
  const headers = new Headers(input.headers)

  if (input.credential) {
    headers.set('Authorization', `Bearer ${input.credential}`)
  }

  let body: Buffer | string | undefined
  if (Buffer.isBuffer(input.body)) {
    body = input.body
  } else if (input.body !== undefined) {
    body = JSON.stringify(input.body)
    headers.set('Content-Type', 'application/json')
  }

  const requestInit: RequestInit = {
    headers,
    method: input.method,
  }

  if (body !== undefined) {
    requestInit.body = body
  }

  const response = await app.request(`http://localhost${pathname}`, requestInit)

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

function sha256(content: Buffer) {
  return createHash('sha256').update(content).digest('hex')
}
