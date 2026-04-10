import { idempotencyKeyHeader, parseApiEnv } from '@life-loop/config'
import { jobKinds, jobStatuses } from '@life-loop/shared-types'
import { type Context, Hono } from 'hono'
import { type ZodTypeAny, z } from 'zod'

import { createJobRecord, listJobs, transitionJobRecord } from '../db/jobs'
import { problemJson } from '../lib/problem'
import { resolveUserActor, UserAuthError } from '../lib/user-auth'

const env = parseApiEnv(process.env)

type JobsContext = Context<{
  Variables: {
    correlationId: string
  }
}>

const actorSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(120).optional(),
  clerkUserId: z.string().trim().min(1).max(191).optional(),
})

const createJobSchema = z.object({
  libraryId: z.string().uuid(),
  deviceId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  kind: z.enum(jobKinds),
  metadata: z
    .object({
      scopeSummary: z.string().trim().min(1).max(180).optional(),
      notes: z.string().trim().min(1).max(280).optional(),
    })
    .optional(),
  restoreDrill: z
    .object({
      sampleSize: z.coerce.number().int().min(1).max(500).optional(),
      notes: z.string().trim().min(1).max(280).optional(),
    })
    .optional(),
  requestedBy: actorSchema.optional(),
})

const transitionJobSchema = z.object({
  status: z.enum(jobStatuses),
  reason: z.string().trim().min(1).max(280).optional(),
  requestedBy: actorSchema.optional(),
})

const listJobsQuerySchema = z.object({
  libraryId: z.string().uuid().optional(),
  kind: z.enum(jobKinds).optional(),
  status: z.enum(jobStatuses).optional(),
})

export const jobsRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

jobsRoutes.get('/jobs', async (context) => {
  const parsedQuery = listJobsQuerySchema.safeParse({
    kind: context.req.query('kind'),
    libraryId: context.req.query('libraryId'),
    status: context.req.query('status'),
  })

  if (!parsedQuery.success) {
    return problemJson(context, {
      title: 'Invalid query',
      status: 422,
      detail: parsedQuery.error.issues[0]?.message ?? 'The request query is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  const jobs = await listJobs({
    ...(parsedQuery.data.kind ? { kind: parsedQuery.data.kind } : {}),
    ...(parsedQuery.data.libraryId ? { libraryId: parsedQuery.data.libraryId } : {}),
    ...(parsedQuery.data.status ? { status: parsedQuery.data.status } : {}),
  })
  return context.json({ jobs })
})

jobsRoutes.post('/jobs', async (context) => {
  const parsedBody = await parseBody(context, createJobSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const requestedBy = await resolveUserActor({
      authorizationHeader: context.req.header('authorization'),
      bootstrapActor: parsedBody.data.requestedBy,
      env,
    })

    const response = await createJobRecord(
      {
        ...parsedBody.data,
        ...(requestedBy ? { requestedBy } : {}),
      },
      context.get('correlationId'),
      context.req.header(idempotencyKeyHeader),
    )

    return context.json(response, 201)
  } catch (error) {
    return mapJobsError(context, error)
  }
})

jobsRoutes.post('/jobs/:jobId/transitions', async (context) => {
  const jobId = context.req.param('jobId')

  if (!z.string().uuid().safeParse(jobId).success) {
    return problemJson(context, {
      title: 'Invalid job id',
      status: 422,
      detail: 'The job id must be a UUID.',
      correlationId: context.get('correlationId'),
    })
  }

  const parsedBody = await parseBody(context, transitionJobSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const requestedBy = await resolveUserActor({
      authorizationHeader: context.req.header('authorization'),
      bootstrapActor: parsedBody.data.requestedBy,
      env,
    })
    const response = await transitionJobRecord(
      jobId,
      {
        ...parsedBody.data,
        ...(requestedBy ? { requestedBy } : {}),
      },
      context.get('correlationId'),
    )
    return context.json(response)
  } catch (error) {
    return mapJobsError(context, error)
  }
})

async function parseBody<TSchema extends ZodTypeAny>(context: JobsContext, schema: TSchema) {
  let json: unknown

  try {
    json = await context.req.json()
  } catch {
    return {
      success: false as const,
      response: problemJson(context, {
        title: 'Invalid JSON body',
        status: 400,
        detail: 'The request body must be valid JSON.',
        correlationId: context.get('correlationId'),
      }),
    }
  }

  const result = schema.safeParse(json)

  if (!result.success) {
    return {
      success: false as const,
      response: problemJson(context, {
        title: 'Validation failed',
        status: 422,
        detail: result.error.issues[0]?.message ?? 'The request body is invalid.',
        correlationId: context.get('correlationId'),
      }),
    }
  }

  return {
    success: true as const,
    data: result.data,
  }
}

function mapJobsError(context: JobsContext, error: unknown) {
  if (error instanceof UserAuthError) {
    return problemJson(context, {
      title: error.title,
      status: error.status,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error instanceof Error && error.message === 'Job not found.') {
    return problemJson(context, {
      title: 'Job not found',
      status: 404,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error instanceof Error && error.message.includes('Authenticated user does not own')) {
    return problemJson(context, {
      title: 'Access denied',
      status: 403,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error instanceof Error && error.message.includes('Idempotency key belongs')) {
    return problemJson(context, {
      title: 'Idempotency key conflict',
      status: 409,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (
    error instanceof Error &&
    (error.message.includes('requires') || error.message.includes('reason is required'))
  ) {
    return problemJson(context, {
      title: 'Invalid job request',
      status: 422,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error instanceof Error && error.message.includes('already terminal')) {
    return problemJson(context, {
      title: 'Terminal job cannot transition',
      status: 409,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return problemJson(context, {
      title: 'Duplicate record',
      status: 409,
      detail: 'A record with the same idempotency key already exists.',
      correlationId: context.get('correlationId'),
    })
  }

  throw error
}
