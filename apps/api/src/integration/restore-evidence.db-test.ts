import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
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
const ownerEmail = `restore-evidence-${runId}@example.test`
const librarySlug = `restore-evidence-${runId}`

before(async () => {
  await runMigrations()
})

after(async () => {
  const pool = getDatabasePool()
  await pool.query('delete from libraries where slug = $1', [librarySlug])
  await pool.query('delete from users where email = $1', [ownerEmail])
  await closeDatabasePool()
})

test('restore evidence cannot pass a drill without matching verified placement evidence', async () => {
  const content = Buffer.from('restore evidence original bytes')
  const checksum = sha256(content)
  const wrongChecksum = sha256(Buffer.from('wrong restore evidence bytes'))

  const { library } = await postJson<{ library: { id: string } }>('/v1/libraries', {
    library: {
      name: 'Restore Evidence Smoke Library',
      slug: librarySlug,
      topology: 'local-first',
    },
    owner: {
      email: ownerEmail,
      displayName: 'Restore Evidence Smoke',
    },
  })

  const desktopCredential = await createAndRedeemDevice(library.id, 'macos')
  await recordHeartbeat(desktopCredential.credential.token)
  const { storageTarget } = await postJson<{ storageTarget: { id: string } }>(
    '/v1/storage-targets',
    {
      libraryId: library.id,
      requestedBy: {
        email: ownerEmail,
      },
      storageTarget: {
        name: 'Restore evidence primary',
        provider: 'local-disk',
        role: 'archive-primary',
        writable: true,
      },
    },
  )

  const { asset } = await postJson<{ asset: { id: string } }>(
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
      filename: 'restore-original.bin',
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
        'Idempotency-Key': `restore-ingest-${runId}`,
      },
    },
  )

  const { job, restoreDrill } = await postJson<{
    job: { id: string }
    restoreDrill: { id: string }
  }>('/v1/jobs', {
    kind: 'restore-drill',
    libraryId: library.id,
    requestedBy: {
      email: ownerEmail,
    },
    restoreDrill: {
      sampleSize: 1,
      notes: 'DB smoke restore drill',
    },
  })

  const directPassResponse = await requestJson(`/v1/jobs/${job.id}/transitions`, {
    body: {
      requestedBy: {
        email: ownerEmail,
      },
      status: 'completed_with_warnings',
      reason: 'Operator note without evidence.',
    },
    method: 'POST',
  })
  assert.equal(directPassResponse.status, 200)
  const directPassPayload = (await directPassResponse.response.json()) as {
    restoreDrill: { status: string }
  }
  assert.equal(directPassPayload.restoreDrill.status, 'scheduled')

  const wrongEvidenceResponse = await requestJson(
    `/v1/restore/drills/${restoreDrill.id}/evidence`,
    {
      body: {
        assetId: asset.id,
        candidateStatus: 'ready',
        checksumSha256: wrongChecksum,
        evidenceStatus: 'verified',
        storageTargetId: storageTarget.id,
        summary: 'Attempted to verify with the wrong checksum.',
      },
      credential: desktopCredential.credential.token,
      method: 'POST',
    },
  )
  assert.equal(wrongEvidenceResponse.status, 422)
  assert.match(
    await wrongEvidenceResponse.response.text(),
    /matching healthy verified original placement/,
  )

  const missingPlacementResponse = await requestJson(
    `/v1/restore/drills/${restoreDrill.id}/evidence`,
    {
      body: {
        assetId: asset.id,
        candidateStatus: 'ready',
        checksumSha256: checksum,
        evidenceStatus: 'verified',
        summary: 'Attempted to verify without a placement id.',
      },
      credential: desktopCredential.credential.token,
      method: 'POST',
    },
  )
  assert.equal(missingPlacementResponse.status, 422)
  assert.match(await missingPlacementResponse.response.text(), /storage target id/)

  const verifiedEvidence = await postJson<{
    drill: { status: string }
    evidence: { checksumSha256: string; evidenceStatus: string; storageTargetId: string }
  }>(
    `/v1/restore/drills/${restoreDrill.id}/evidence`,
    {
      assetId: asset.id,
      candidateStatus: 'ready',
      checksumSha256: checksum,
      evidenceStatus: 'verified',
      storageTargetId: storageTarget.id,
      summary: 'Restored sample checksum matched verified original placement.',
    },
    {
      credential: desktopCredential.credential.token,
    },
  )
  assert.equal(verifiedEvidence.drill.status, 'passed')
  assert.equal(verifiedEvidence.evidence.evidenceStatus, 'verified')
  assert.equal(verifiedEvidence.evidence.checksumSha256, checksum)
  assert.equal(verifiedEvidence.evidence.storageTargetId, storageTarget.id)
})

async function createAndRedeemDevice(libraryId: string, platform: 'macos') {
  const enrollment = await postJson<{
    device: { id: string }
    enrollmentToken: { token: string }
  }>('/v1/devices', {
    device: {
      name: `${platform} restore evidence device`,
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

function sha256(content: Buffer) {
  return createHash('sha256').update(content).digest('hex')
}
