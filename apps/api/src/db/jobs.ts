import type {
  CreateJobInput,
  CreateJobResponse,
  JobRun,
  JobStatus,
  RestoreDrill,
  TransitionJobInput,
} from '@life-loop/shared-types'
import type { PoolClient } from 'pg'
import {
  mapRestoreDrillFromStatus,
  validateCreateJobInput,
  validateJobTransition,
} from '../lib/job-rules'
import { insertAuditEvent } from './audit'
import { assertLibraryOwnedByClerkUser } from './authorization'
import { getDatabasePool } from './client'

type JobFilters = {
  kind?: JobRun['kind']
  libraryId?: string
  status?: JobStatus
}

type JobRow = JobRun & {
  restoreDrillId?: string
}

type RestoreDrillRow = RestoreDrill

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
        id::text,
        library_id::text as "libraryId",
        asset_id::text as "assetId",
        device_id::text as "deviceId",
        kind,
        status,
        correlation_id::text as "correlationId",
        attempt_count as "attemptCount",
        blocking_reason as "blockingReason",
        payload->>'restoreDrillId' as "restoreDrillId",
        to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
        to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
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
          id::text,
          library_id::text as "libraryId",
          asset_id::text as "assetId",
          device_id::text as "deviceId",
          kind,
          status,
          correlation_id::text as "correlationId",
          attempt_count as "attemptCount",
          blocking_reason as "blockingReason",
          payload->>'restoreDrillId' as "restoreDrillId",
          to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
          to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
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
          updated_at = now()
        where id = $1::uuid
        returning
          id::text,
          library_id::text as "libraryId",
          asset_id::text as "assetId",
          device_id::text as "deviceId",
          kind,
          status,
          correlation_id::text as "correlationId",
          attempt_count as "attemptCount",
          blocking_reason as "blockingReason",
          payload->>'restoreDrillId' as "restoreDrillId",
          to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
          to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
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

async function findJobById(client: PoolClient, jobId: string, forUpdate = false) {
  const result = await client.query<JobRow>(
    `
      select
        id::text,
        library_id::text as "libraryId",
        asset_id::text as "assetId",
        device_id::text as "deviceId",
        kind,
        status,
        correlation_id::text as "correlationId",
        attempt_count as "attemptCount",
        blocking_reason as "blockingReason",
        payload->>'restoreDrillId' as "restoreDrillId",
        to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
        to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
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
        id::text,
        library_id::text as "libraryId",
        asset_id::text as "assetId",
        device_id::text as "deviceId",
        kind,
        status,
        correlation_id::text as "correlationId",
        attempt_count as "attemptCount",
        blocking_reason as "blockingReason",
        payload->>'restoreDrillId' as "restoreDrillId",
        to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
        to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
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

function stripRestoreDrillId(job: JobRow): JobRun {
  const { restoreDrillId: _restoreDrillId, ...jobWithoutRestoreDrillId } = job
  return jobWithoutRestoreDrillId
}
