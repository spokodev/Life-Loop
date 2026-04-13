import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { idempotencyKeyHeader, parseApiEnv } from '@life-loop/config'
import { jobKinds, jobStatuses } from '@life-loop/shared-types'
import { type Context, Hono } from 'hono'
import { type ZodTypeAny, z } from 'zod'

import { authorizeHostedStagingSourceFetch } from '../db/hosted-staging'
import {
  claimNextJobForDevice,
  completeClaimedJob,
  createJobRecord,
  heartbeatClaimedJob,
  listJobs,
  transitionJobRecord,
} from '../db/jobs'
import { parseBearerToken } from '../lib/bearer-token'
import { resolveHostedStagingObjectPath } from '../lib/hosted-staging-store'
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

const executionSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('agent-local-staging'),
    localSourceId: z.string().trim().min(1).max(191),
    stagingObjectId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('hosted-staging'),
    localSourceId: z.string().trim().min(1).max(191).optional(),
    stagingObjectId: z.string().uuid(),
  }),
])

const checksumSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i)
  .transform((checksum) => checksum.toLowerCase())

const storageTargetRelativePathSchema = z.string().trim().min(1).max(1024)

const archivePlacementExecutionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.literal('archive-placement'),
  storageTargetId: z.string().trim().min(1).max(191),
  provider: z.string().trim().min(1).max(120),
  relativePath: storageTargetRelativePathSchema,
  blobId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  checksumSha256: checksumSchema,
  sizeBytes: z.coerce.number().int().min(0).optional(),
  source: executionSourceSchema.optional(),
})

const placementVerificationExecutionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.literal('placement-verification'),
  storageTargetId: z.string().trim().min(1).max(191),
  provider: z.string().trim().min(1).max(120),
  relativePath: storageTargetRelativePathSchema,
  blobId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  checksumSha256: checksumSchema,
  sizeBytes: z.coerce.number().int().min(0).optional(),
})

const restoreDrillExecutionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.literal('restore-drill'),
  restoreDrillId: z.string().trim().uuid().optional(),
  samples: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        candidateStatus: z.enum(['ready', 'degraded', 'blocked']),
        source: z.object({
          storageTargetId: z.string().trim().min(1).max(191),
          provider: z.string().trim().min(1).max(120),
          relativePath: storageTargetRelativePathSchema,
          blobId: z.string().uuid().optional(),
          checksumSha256: checksumSchema,
          sizeBytes: z.coerce.number().int().min(0).optional(),
        }),
      }),
    )
    .min(1)
    .max(50),
})

const executionManifestSchema = z.discriminatedUnion('operation', [
  archivePlacementExecutionManifestSchema,
  placementVerificationExecutionManifestSchema,
  restoreDrillExecutionManifestSchema,
])

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
  execution: executionManifestSchema.optional(),
  requestedBy: actorSchema.optional(),
})

const transitionJobSchema = z.object({
  status: z.enum(jobStatuses),
  reason: z.string().trim().min(1).max(280).optional(),
  requestedBy: actorSchema.optional(),
})

const claimJobSchema = z.object({
  kinds: z.array(z.enum(jobKinds)).min(1).max(10).optional(),
  leaseSeconds: z.coerce.number().int().min(30).max(3600).optional(),
})

const heartbeatClaimSchema = z.object({
  leaseToken: z.string().trim().min(16).max(512),
  leaseSeconds: z.coerce.number().int().min(30).max(3600).optional(),
})

const completeClaimSchema = z.object({
  leaseToken: z.string().trim().min(16).max(512),
  status: z.enum(['succeeded', 'completed_with_warnings', 'failed', 'blocked']),
  reason: z.string().trim().min(1).max(280).optional(),
  safeErrorClass: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9._-]{0,79}$/)
    .optional(),
})

const listJobsQuerySchema = z.object({
  libraryId: z.string().uuid().optional(),
  kind: z.enum(jobKinds).optional(),
  status: z.enum(jobStatuses).optional(),
})

const jobIdParamSchema = z.object({
  jobId: z.string().uuid(),
})

const hostedStagingSourceParamSchema = z.object({
  jobId: z.string().uuid(),
  stagingObjectId: z.string().uuid(),
})

const hostedStagingSourceFetchSchema = z.object({
  leaseToken: z.string().trim().min(16).max(512),
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

jobsRoutes.post('/jobs/claims', async (context) => {
  const bearerToken = getBearerToken(context)

  if (!bearerToken) {
    return problemJson(context, {
      title: 'Authorization required',
      status: 401,
      detail: 'Job claim requests must include a Bearer device credential.',
      correlationId: context.get('correlationId'),
    })
  }

  const parsedBody = await parseOptionalBody(context, claimJobSchema, {})

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const response = await claimNextJobForDevice(
      bearerToken,
      normalizeClaimJobInput(parsedBody.data),
      context.get('correlationId'),
    )

    return context.json(response)
  } catch (error) {
    return mapJobsError(context, error)
  }
})

jobsRoutes.post('/jobs/:jobId/claims/heartbeat', async (context) => {
  const parsedParams = jobIdParamSchema.safeParse({
    jobId: context.req.param('jobId'),
  })

  if (!parsedParams.success) {
    return problemJson(context, {
      title: 'Invalid job id',
      status: 422,
      detail: parsedParams.error.issues[0]?.message ?? 'The job id is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  const bearerToken = getBearerToken(context)

  if (!bearerToken) {
    return problemJson(context, {
      title: 'Authorization required',
      status: 401,
      detail: 'Job claim heartbeat requests must include a Bearer device credential.',
      correlationId: context.get('correlationId'),
    })
  }

  const parsedBody = await parseBody(context, heartbeatClaimSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const response = await heartbeatClaimedJob(
      bearerToken,
      parsedParams.data.jobId,
      normalizeHeartbeatClaimInput(parsedBody.data),
      context.get('correlationId'),
    )

    return context.json(response)
  } catch (error) {
    return mapJobsError(context, error)
  }
})

jobsRoutes.post('/jobs/:jobId/claims/complete', async (context) => {
  const parsedParams = jobIdParamSchema.safeParse({
    jobId: context.req.param('jobId'),
  })

  if (!parsedParams.success) {
    return problemJson(context, {
      title: 'Invalid job id',
      status: 422,
      detail: parsedParams.error.issues[0]?.message ?? 'The job id is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  const bearerToken = getBearerToken(context)

  if (!bearerToken) {
    return problemJson(context, {
      title: 'Authorization required',
      status: 401,
      detail: 'Job claim completion requests must include a Bearer device credential.',
      correlationId: context.get('correlationId'),
    })
  }

  const parsedBody = await parseBody(context, completeClaimSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const response = await completeClaimedJob(
      bearerToken,
      parsedParams.data.jobId,
      normalizeCompleteClaimInput(parsedBody.data),
      context.get('correlationId'),
    )

    return context.json(response)
  } catch (error) {
    return mapJobsError(context, error)
  }
})

jobsRoutes.post('/jobs/:jobId/sources/hosted-staging/:stagingObjectId', async (context) => {
  const parsedParams = hostedStagingSourceParamSchema.safeParse({
    jobId: context.req.param('jobId'),
    stagingObjectId: context.req.param('stagingObjectId'),
  })

  if (!parsedParams.success) {
    return problemJson(context, {
      title: 'Invalid hosted staging source request',
      status: 422,
      detail:
        parsedParams.error.issues[0]?.message ?? 'The hosted staging source request is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  const bearerToken = getBearerToken(context)

  if (!bearerToken) {
    return problemJson(context, {
      title: 'Authorization required',
      status: 401,
      detail: 'Hosted staging source fetch requests must include a Bearer device credential.',
      correlationId: context.get('correlationId'),
    })
  }

  const parsedBody = await parseBody(context, hostedStagingSourceFetchSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const source = await authorizeHostedStagingSourceFetch(
      bearerToken,
      {
        jobId: parsedParams.data.jobId,
        leaseToken: parsedBody.data.leaseToken,
        stagingObjectId: parsedParams.data.stagingObjectId,
      },
      context.get('correlationId'),
    )
    const objectPath = resolveHostedStagingObjectPath(env.HOSTED_STAGING_ROOT, source.objectKey)
    try {
      await access(objectPath)
    } catch {
      throw new Error('Hosted staging object file is not available.')
    }

    return new Response(
      Readable.toWeb(createReadStream(objectPath)) as ReadableStream<Uint8Array>,
      {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="life-loop-staged-object"',
          'Content-Length': String(source.sizeBytes),
          'Content-Type': source.contentType ?? 'application/octet-stream',
          'X-Life-Loop-Checksum-Sha256': source.checksumSha256,
          'X-Content-Type-Options': 'nosniff',
        },
        status: 200,
      },
    )
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

async function parseOptionalBody<TSchema extends ZodTypeAny>(
  context: JobsContext,
  schema: TSchema,
  fallback: z.input<TSchema>,
) {
  const rawBody = await context.req.text()
  const trimmedBody = rawBody.trim()

  if (!trimmedBody) {
    const result = schema.safeParse(fallback)

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

  let json: unknown

  try {
    json = JSON.parse(trimmedBody)
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

function getBearerToken(context: JobsContext) {
  return parseBearerToken(context.req.header('authorization'))
}

function normalizeClaimJobInput(data: z.infer<typeof claimJobSchema>) {
  return {
    ...(data.kinds ? { kinds: data.kinds } : {}),
    ...(data.leaseSeconds ? { leaseSeconds: data.leaseSeconds } : {}),
  }
}

function normalizeHeartbeatClaimInput(data: z.infer<typeof heartbeatClaimSchema>) {
  return {
    leaseToken: data.leaseToken,
    ...(data.leaseSeconds ? { leaseSeconds: data.leaseSeconds } : {}),
  }
}

function normalizeCompleteClaimInput(data: z.infer<typeof completeClaimSchema>) {
  return {
    leaseToken: data.leaseToken,
    status: data.status,
    ...(data.reason ? { reason: data.reason } : {}),
    ...(data.safeErrorClass ? { safeErrorClass: data.safeErrorClass } : {}),
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

  if (
    error instanceof Error &&
    (error.message.includes('Device credential was not found') ||
      error.message.includes('Device credential secret is invalid') ||
      error.message.includes('Device credential must include') ||
      error.message.includes('Job lease token is invalid'))
  ) {
    return problemJson(context, {
      title: 'Authentication failed',
      status: 401,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (
    error instanceof Error &&
    (error.message.includes('Device has been revoked') ||
      error.message.includes('Device is paused') ||
      error.message.includes('Device credential is not active') ||
      error.message.includes('desktop device credential') ||
      error.message.includes('Authenticated device does not belong') ||
      error.message.includes('claim is owned by a different device'))
  ) {
    return problemJson(context, {
      title: 'Access denied',
      status: 403,
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

  if (error instanceof Error && error.message === 'Hosted staging object not found.') {
    return problemJson(context, {
      title: 'Hosted staging object not found',
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
    (error.message.includes('requires') ||
      error.message.includes('Execution manifest') ||
      error.message.includes('reason is required') ||
      error.message.includes('summary is required'))
  ) {
    return problemJson(context, {
      title: 'Invalid job request',
      status: 422,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (
    error instanceof Error &&
    (error.message.includes('not running and cannot be mutated') ||
      error.message.includes('not running and cannot fetch') ||
      error.message.includes('lease has expired'))
  ) {
    return problemJson(context, {
      title: 'Claim lease conflict',
      status: 409,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (
    error instanceof Error &&
    (error.message.includes('Hosted staging object is not ready') ||
      error.message.includes('Hosted staging object has expired') ||
      error.message.includes('Hosted staging object file is not available') ||
      error.message.includes('Hosted staging checksum does not match') ||
      error.message.includes('Hosted staging size does not match') ||
      error.message.includes('Hosted staging source does not match') ||
      error.message.includes('does not reference a hosted-staging'))
  ) {
    return problemJson(context, {
      title: 'Hosted staging source unavailable',
      status: 409,
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
