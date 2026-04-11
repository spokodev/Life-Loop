import type {
  ClaimJobInput,
  ClaimJobResponse,
  CompleteJobClaimInput,
  CompleteJobClaimResponse,
  CreateJobInput,
  CreateJobResponse,
  HeartbeatJobClaimInput,
  HeartbeatJobClaimResponse,
  JobExecutionManifest,
  JobRun,
  JobStatus,
  RestoreDrill,
  TransitionJobInput,
} from '@life-loop/shared-types'
import type { PoolClient } from 'pg'
import { generateJobLeaseToken, hashJobLeaseToken, verifyJobLeaseToken } from '../lib/job-lease'
import {
  mapRestoreDrillFromStatus,
  validateCreateJobInput,
  validateJobTransition,
} from '../lib/job-rules'
import { insertAuditEvent } from './audit'
import { assertLibraryOwnedByClerkUser } from './authorization'
import { getDatabasePool } from './client'
import { type AuthenticatedDeviceCredential, authenticateDeviceCredential } from './device-auth'

type JobFilters = {
  kind?: JobRun['kind']
  libraryId?: string
  status?: JobStatus
}

type JobRow = JobRun & {
  restoreDrillId?: string
}

type RestoreDrillRow = RestoreDrill

type LeaseJobRow = JobRow & {
  leaseTokenHash: string | null
}

type ClaimJobRow = JobRow & {
  execution: JobExecutionManifest | null
}

const defaultLeaseSeconds = 300

const jobSelectSql = `
  id::text,
  library_id::text as "libraryId",
  asset_id::text as "assetId",
  device_id::text as "deviceId",
  claimed_by_device_id::text as "claimedByDeviceId",
  kind,
  status,
  correlation_id::text as "correlationId",
  attempt_count as "attemptCount",
  blocking_reason as "blockingReason",
  payload->>'restoreDrillId' as "restoreDrillId",
  to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
  to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt",
  to_char(lease_expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "leaseExpiresAt",
  to_char(last_heartbeat_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastHeartbeatAt",
  to_char(started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startedAt",
  to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "completedAt"
`

const jobClaimSelectSql = `
  ${jobSelectSql},
  payload->'execution' as "execution"
`

export async function listJobs(filters: JobFilters = {}) {
  const databasePool = getDatabasePool()
  const conditions: string[] = []
  const values: Array<string | null> = []

  if (filters.libraryId) {
    values.push(filters.libraryId)
    conditions.push(`library_id = $${values.length}::uuid`)
  }

  if (filters.status) {
    values.push(filters.status)
    conditions.push(`status = $${values.length}`)
  }

  if (filters.kind) {
    values.push(filters.kind)
    conditions.push(`kind = $${values.length}`)
  }

  const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''
  const result = await databasePool.query<JobRow>(
    `
      select
        ${jobSelectSql}
      from job_runs
      ${whereClause}
      order by updated_at desc
      limit 50
    `,
    values,
  )

  return result.rows.map(stripRestoreDrillId)
}

export async function createJobRecord(
  input: CreateJobInput,
  correlationId: string,
  idempotencyKey?: string,
): Promise<CreateJobResponse> {
  const validationMessage = validateCreateJobInput(input)

  if (validationMessage) {
    throw new Error(validationMessage)
  }

  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    if (input.requestedBy?.clerkUserId) {
      await assertLibraryOwnedByClerkUser(client, input.libraryId, input.requestedBy.clerkUserId)
    }

    if (idempotencyKey) {
      const existingJob = await findJobByIdempotencyKey(client, idempotencyKey)

      if (existingJob) {
        if (existingJob.libraryId !== input.libraryId) {
          throw new Error('Idempotency key belongs to a different job scope.')
        }

        const existingRestoreDrill = existingJob.restoreDrillId
          ? await findRestoreDrillById(client, existingJob.restoreDrillId)
          : undefined

        await client.query('commit')

        const replayedResponse = {
          job: stripRestoreDrillId(existingJob),
          replayed: true,
          ...(existingRestoreDrill ? { restoreDrill: existingRestoreDrill } : {}),
        }

        return replayedResponse
      }
    }

    let restoreDrill: RestoreDrill | undefined
    let restoreDrillId: string | undefined

    if (input.kind === 'restore-drill') {
      const restoreDrillResult = await client.query<RestoreDrillRow>(
        `
          insert into restore_drills (library_id, status, sample_size, notes)
          values ($1::uuid, 'scheduled', $2, $3)
          returning
            id::text,
            library_id::text as "libraryId",
            status,
            sample_size as "sampleSize",
            to_char(started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startedAt",
            to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "completedAt",
            notes
        `,
        [input.libraryId, input.restoreDrill?.sampleSize ?? 12, input.restoreDrill?.notes ?? null],
      )

      restoreDrill = restoreDrillResult.rows[0]

      if (!restoreDrill) {
        throw new Error('Restore drill insert did not return a row.')
      }

      restoreDrillId = restoreDrill.id
    }

    const payload = {
      ...(input.metadata?.scopeSummary ? { scopeSummary: input.metadata.scopeSummary } : {}),
      ...(input.metadata?.notes ? { notes: input.metadata.notes } : {}),
      ...(restoreDrillId ? { restoreDrillId } : {}),
      ...(input.execution ? { execution: input.execution } : {}),
    }

    const jobResult = await client.query<JobRow>(
      `
        insert into job_runs (
          library_id,
          asset_id,
          device_id,
          kind,
          status,
          correlation_id,
          attempt_count,
          blocking_reason,
          payload,
          idempotency_key
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4, 'queued', $5::uuid, 0, null, $6::jsonb, $7)
        returning
          ${jobSelectSql}
      `,
      [
        input.libraryId,
        input.assetId ?? null,
        input.deviceId ?? null,
        input.kind,
        correlationId,
        JSON.stringify(payload),
        idempotencyKey ?? null,
      ],
    )

    const job = jobResult.rows[0]

    if (!job) {
      throw new Error('Job insert did not return a row.')
    }

    await insertAuditEvent(client, {
      actorId: input.requestedBy?.clerkUserId ?? input.requestedBy?.email ?? null,
      actorType: input.requestedBy ? 'user' : 'system',
      correlationId,
      eventType: 'job.created',
      libraryId: input.libraryId,
      payload: {
        assetId: input.assetId ?? null,
        deviceId: input.deviceId ?? null,
        idempotencyKey: idempotencyKey ?? null,
        kind: input.kind,
        jobId: job.id,
        restoreDrillId: restoreDrillId ?? null,
      },
    })

    await client.query('commit')

    const response = {
      job: stripRestoreDrillId(job),
      replayed: false,
      ...(restoreDrill ? { restoreDrill } : {}),
    }

    return response
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function claimNextJobForDevice(
  authorizationToken: string,
  input: ClaimJobInput,
  correlationId: string,
): Promise<ClaimJobResponse> {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()
  const leaseSeconds = input.leaseSeconds ?? defaultLeaseSeconds

  try {
    await client.query('begin')
    const credential = await authenticateClaimingDevice(client, authorizationToken)
    const recoveredJobIds = await recoverExpiredLeasesForLibrary(client, credential, correlationId)

    const claimableResult = await client.query<ClaimJobRow>(
      `
        select
          ${jobClaimSelectSql}
        from job_runs
        where library_id = $1::uuid
          and status in ('queued', 'retrying')
          and (device_id is null or device_id = $2::uuid)
          and ($3::text[] is null or kind = any($3::text[]))
        order by updated_at asc, created_at asc
        for update skip locked
        limit 1
      `,
      [credential.libraryId, credential.id, input.kinds ?? null],
    )

    const claimableJob = claimableResult.rows[0]

    if (!claimableJob) {
      await client.query('commit')
      return {
        recoveredExpiredCount: recoveredJobIds.length,
      }
    }

    const leaseToken = generateJobLeaseToken()
    const leaseTokenHash = hashJobLeaseToken(leaseToken)
    const claimedResult = await client.query<ClaimJobRow>(
      `
        update job_runs
        set
          status = 'running',
          claimed_by_device_id = $2::uuid,
          lease_token_hash = $3,
          lease_expires_at = now() + make_interval(secs => $4::int),
          last_heartbeat_at = now(),
          started_at = coalesce(started_at, now()),
          blocking_reason = null,
          updated_at = now()
        where id = $1::uuid
        returning
          ${jobClaimSelectSql}
      `,
      [claimableJob.id, credential.id, leaseTokenHash, leaseSeconds],
    )
    const claimedJob = claimedResult.rows[0]

    if (!claimedJob?.leaseExpiresAt) {
      throw new Error('Job claim did not return a lease.')
    }

    await insertAuditEvent(client, {
      actorId: credential.id,
      actorType: 'device',
      correlationId,
      eventType: 'job.claimed',
      libraryId: credential.libraryId,
      payload: {
        deviceId: credential.id,
        jobId: claimedJob.id,
        kind: claimedJob.kind,
        leaseExpiresAt: claimedJob.leaseExpiresAt,
      },
    })

    await client.query('commit')

    return {
      recoveredExpiredCount: recoveredJobIds.length,
      claim: {
        job: stripRestoreDrillId(claimedJob),
        lease: {
          leaseToken,
          leaseExpiresAt: claimedJob.leaseExpiresAt,
        },
        ...(claimedJob.execution ? { execution: claimedJob.execution } : {}),
      },
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function heartbeatClaimedJob(
  authorizationToken: string,
  jobId: string,
  input: HeartbeatJobClaimInput,
  correlationId: string,
): Promise<HeartbeatJobClaimResponse> {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()
  const leaseSeconds = input.leaseSeconds ?? defaultLeaseSeconds

  try {
    await client.query('begin')
    const credential = await authenticateClaimingDevice(client, authorizationToken)
    await assertActiveClaimLease(client, jobId, credential, input.leaseToken)

    const heartbeatResult = await client.query<JobRow>(
      `
        update job_runs
        set
          lease_expires_at = now() + make_interval(secs => $3::int),
          last_heartbeat_at = now(),
          updated_at = now()
        where id = $1::uuid
          and claimed_by_device_id = $2::uuid
        returning
          ${jobSelectSql}
      `,
      [jobId, credential.id, leaseSeconds],
    )
    const updatedJob = heartbeatResult.rows[0]

    if (!updatedJob?.leaseExpiresAt) {
      throw new Error('Job heartbeat did not return a lease.')
    }

    await insertAuditEvent(client, {
      actorId: credential.id,
      actorType: 'device',
      correlationId,
      eventType: 'job.lease_heartbeat',
      libraryId: credential.libraryId,
      payload: {
        deviceId: credential.id,
        jobId: updatedJob.id,
        leaseExpiresAt: updatedJob.leaseExpiresAt,
      },
    })

    await client.query('commit')

    return {
      job: stripRestoreDrillId(updatedJob),
      lease: {
        leaseToken: input.leaseToken,
        leaseExpiresAt: updatedJob.leaseExpiresAt,
      },
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function completeClaimedJob(
  authorizationToken: string,
  jobId: string,
  input: CompleteJobClaimInput,
  correlationId: string,
): Promise<CompleteJobClaimResponse> {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')
    const credential = await authenticateClaimingDevice(client, authorizationToken)
    const currentJob = await assertActiveClaimLease(client, jobId, credential, input.leaseToken)
    const validationMessage = validateJobTransition(stripRestoreDrillId(currentJob), {
      status: input.status,
      ...(input.reason ? { reason: input.reason } : {}),
    })

    if (validationMessage) {
      throw new Error(validationMessage)
    }

    const completedResult = await client.query<JobRow>(
      `
        update job_runs
        set
          status = $2,
          blocking_reason = $3,
          lease_token_hash = null,
          lease_expires_at = null,
          completed_at = case when $2 = 'blocked' then null else now() end,
          payload = case
            when $4::text is null then payload
            else jsonb_set(coalesce(payload, '{}'::jsonb), '{safeErrorClass}', to_jsonb($4::text), true)
          end,
          updated_at = now()
        where id = $1::uuid
        returning
          ${jobSelectSql}
      `,
      [jobId, input.status, input.reason?.trim() || null, input.safeErrorClass ?? null],
    )
    const completedJob = completedResult.rows[0]

    if (!completedJob) {
      throw new Error('Job completion did not return a row.')
    }

    await insertAuditEvent(client, {
      actorId: credential.id,
      actorType: 'device',
      correlationId,
      eventType: 'job.claim_completed',
      libraryId: credential.libraryId,
      payload: {
        deviceId: credential.id,
        jobId: completedJob.id,
        reason: input.reason ?? null,
        safeErrorClass: input.safeErrorClass ?? null,
        toStatus: completedJob.status,
      },
    })

    await client.query('commit')

    return {
      job: stripRestoreDrillId(completedJob),
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function transitionJobRecord(
  jobId: string,
  input: TransitionJobInput,
  correlationId: string,
) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const currentJob = await findJobById(client, jobId, true)

    if (!currentJob) {
      throw new Error('Job not found.')
    }

    if (input.requestedBy?.clerkUserId) {
      if (!currentJob.libraryId) {
        throw new Error('Job is missing a library scope.')
      }

      await assertLibraryOwnedByClerkUser(
        client,
        currentJob.libraryId,
        input.requestedBy.clerkUserId,
      )
    }

    const validationMessage = validateJobTransition(stripRestoreDrillId(currentJob), input)

    if (validationMessage) {
      throw new Error(validationMessage)
    }

    const nextAttemptCount =
      input.status === 'retrying' ? currentJob.attemptCount + 1 : currentJob.attemptCount

    const updateResult = await client.query<JobRow>(
      `
        update job_runs
        set
          status = $2,
          blocking_reason = $3,
          attempt_count = $4,
          lease_token_hash = case when $2 = 'running' then lease_token_hash else null end,
          lease_expires_at = case when $2 = 'running' then lease_expires_at else null end,
          completed_at = case
            when $2 in ('succeeded', 'completed_with_warnings', 'failed', 'cancelled') then coalesce(completed_at, now())
            when $2 in ('queued', 'retrying', 'running') then null
            else completed_at
          end,
          updated_at = now()
        where id = $1::uuid
        returning
          ${jobSelectSql}
      `,
      [jobId, input.status, input.reason?.trim() || null, nextAttemptCount],
    )

    const updatedJob = updateResult.rows[0]

    if (!updatedJob) {
      throw new Error('Job update did not return a row.')
    }

    let restoreDrill: RestoreDrill | undefined

    if (updatedJob.kind === 'restore-drill' && updatedJob.restoreDrillId) {
      const currentDrill = await findRestoreDrillById(client, updatedJob.restoreDrillId)

      if (currentDrill) {
        const nextDrill = mapRestoreDrillFromStatus(currentDrill, input)
        const restoreDrillResult = await client.query<RestoreDrillRow>(
          `
            update restore_drills
            set
              status = $2,
              started_at = $3::timestamptz,
              completed_at = $4::timestamptz,
              notes = $5
            where id = $1::uuid
            returning
              id::text,
              library_id::text as "libraryId",
              status,
              sample_size as "sampleSize",
              to_char(started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startedAt",
              to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "completedAt",
              notes
          `,
          [
            updatedJob.restoreDrillId,
            nextDrill.status,
            nextDrill.startedAt ?? null,
            nextDrill.completedAt ?? null,
            nextDrill.notes ?? null,
          ],
        )

        restoreDrill = restoreDrillResult.rows[0]
      }
    }

    await insertAuditEvent(client, {
      actorId: input.requestedBy?.clerkUserId ?? input.requestedBy?.email ?? null,
      actorType: input.requestedBy ? 'user' : 'system',
      correlationId,
      eventType: 'job.status_changed',
      libraryId: updatedJob.libraryId ?? null,
      payload: {
        fromStatus: currentJob.status,
        jobId: updatedJob.id,
        reason: input.reason ?? null,
        restoreDrillId: updatedJob.restoreDrillId ?? null,
        toStatus: updatedJob.status,
      },
    })

    await client.query('commit')

    return {
      job: stripRestoreDrillId(updatedJob),
      restoreDrill,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function authenticateClaimingDevice(client: PoolClient, authorizationToken: string) {
  const credential = await authenticateDeviceCredential(client, authorizationToken)

  if (credential.status === 'revoked') {
    throw new Error('Device has been revoked.')
  }

  if (credential.status === 'paused') {
    throw new Error('Device is paused.')
  }

  return credential
}

async function recoverExpiredLeasesForLibrary(
  client: PoolClient,
  credential: AuthenticatedDeviceCredential,
  correlationId: string,
) {
  const recoveredResult = await client.query<{ id: string }>(
    `
      update job_runs
      set
        status = 'retrying',
        attempt_count = attempt_count + 1,
        blocking_reason = 'Lease expired before completion.',
        claimed_by_device_id = null,
        lease_token_hash = null,
        lease_expires_at = null,
        last_heartbeat_at = null,
        updated_at = now()
      where library_id = $1::uuid
        and status = 'running'
        and lease_expires_at is not null
        and lease_expires_at <= now()
      returning id::text
    `,
    [credential.libraryId],
  )

  if (recoveredResult.rows.length > 0) {
    await insertAuditEvent(client, {
      actorId: credential.id,
      actorType: 'device',
      correlationId,
      eventType: 'job.expired_leases_recovered',
      libraryId: credential.libraryId,
      payload: {
        deviceId: credential.id,
        recoveredJobIds: recoveredResult.rows.map((row) => row.id),
        recoveredCount: recoveredResult.rows.length,
      },
    })
  }

  return recoveredResult.rows.map((row) => row.id)
}

async function assertActiveClaimLease(
  client: PoolClient,
  jobId: string,
  credential: AuthenticatedDeviceCredential,
  leaseToken: string,
) {
  const result = await client.query<LeaseJobRow>(
    `
      select
        ${jobSelectSql},
        lease_token_hash as "leaseTokenHash"
      from job_runs
      where id = $1::uuid
      for update
      limit 1
    `,
    [jobId],
  )
  const job = result.rows[0]

  if (!job) {
    throw new Error('Job not found.')
  }

  if (job.libraryId !== credential.libraryId) {
    throw new Error('Authenticated device does not belong to the job library.')
  }

  if (job.status !== 'running') {
    throw new Error(`Job ${job.id} is not running and cannot be mutated by a claim lease.`)
  }

  if (job.claimedByDeviceId !== credential.id) {
    throw new Error('Job claim is owned by a different device.')
  }

  if (!verifyJobLeaseToken(leaseToken, job.leaseTokenHash)) {
    throw new Error('Job lease token is invalid.')
  }

  if (!job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= Date.now()) {
    throw new Error('Job lease has expired and must be reclaimed.')
  }

  return job
}

async function findJobById(client: PoolClient, jobId: string, forUpdate = false) {
  const result = await client.query<JobRow>(
    `
      select
        ${jobSelectSql}
      from job_runs
      where id = $1::uuid
      ${forUpdate ? 'for update' : ''}
      limit 1
    `,
    [jobId],
  )

  return result.rows[0]
}

async function findJobByIdempotencyKey(client: PoolClient, idempotencyKey: string) {
  const result = await client.query<JobRow>(
    `
      select
        ${jobSelectSql}
      from job_runs
      where idempotency_key = $1
      limit 1
    `,
    [idempotencyKey],
  )

  return result.rows[0]
}

async function findRestoreDrillById(client: PoolClient, restoreDrillId: string) {
  const result = await client.query<RestoreDrillRow>(
    `
      select
        id::text,
        library_id::text as "libraryId",
        status,
        sample_size as "sampleSize",
        to_char(started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startedAt",
        to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "completedAt",
        notes
      from restore_drills
      where id = $1::uuid
      limit 1
    `,
    [restoreDrillId],
  )

  return result.rows[0]
}

function stripRestoreDrillId(
  job: JobRow & { execution?: unknown; leaseTokenHash?: unknown },
): JobRun {
  const {
    execution: _execution,
    leaseTokenHash: _leaseTokenHash,
    restoreDrillId: _restoreDrillId,
    ...jobWithoutRestoreDrillId
  } = job
  return jobWithoutRestoreDrillId
}
