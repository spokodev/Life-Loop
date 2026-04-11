import { type Context, Hono } from 'hono'
import { z } from 'zod'

import { getRestoreReadiness } from '../db/assets'
import { listRestoreDrillDetails, recordRestoreDrillEvidence } from '../db/restore'
import { parseBearerToken } from '../lib/bearer-token'
import { problemJson } from '../lib/problem'

const evidenceStatusSchema = z.enum([
  'ready',
  'restored',
  'verified',
  'partial',
  'failed',
  'blocked',
])
const candidateStatusSchema = z.enum(['ready', 'degraded', 'blocked'])
const restoreDrillIdParamSchema = z.object({
  restoreDrillId: z.string().uuid(),
})
const recordRestoreEvidenceSchema = z.object({
  assetId: z.string().uuid(),
  storageTargetId: z.string().uuid().optional(),
  candidateStatus: candidateStatusSchema,
  evidenceStatus: evidenceStatusSchema,
  checksumSha256: z.string().trim().length(64).optional(),
  safeErrorClass: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9._-]{0,79}$/)
    .optional(),
  summary: z.string().trim().min(1).max(320),
  verifiedAt: z.string().datetime({ offset: true }).optional(),
})

export const restoreRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

type RestoreContext = Context<{
  Variables: {
    correlationId: string
  }
}>

restoreRoutes.get('/restore/readiness', async (context) => {
  const readiness = await getRestoreReadiness()
  return context.json(readiness)
})

restoreRoutes.get('/restore/drills', async (context) => {
  const drills = await listRestoreDrillDetails()
  return context.json({ drills })
})

restoreRoutes.post('/restore/drills/:restoreDrillId/evidence', async (context) => {
  const parsedParams = restoreDrillIdParamSchema.safeParse({
    restoreDrillId: context.req.param('restoreDrillId'),
  })

  if (!parsedParams.success) {
    return problemJson(context, {
      title: 'Invalid restore drill id',
      status: 422,
      detail: parsedParams.error.issues[0]?.message ?? 'The restore drill id is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  const bearerToken = parseBearerToken(context.req.header('authorization'))

  if (!bearerToken) {
    return problemJson(context, {
      title: 'Authorization required',
      status: 401,
      detail: 'Restore drill evidence reports must include a Bearer device credential.',
      correlationId: context.get('correlationId'),
    })
  }

  let body: unknown

  try {
    body = await context.req.json()
  } catch {
    return problemJson(context, {
      title: 'Invalid JSON body',
      status: 400,
      detail: 'The request body must be valid JSON.',
      correlationId: context.get('correlationId'),
    })
  }

  const parsedBody = recordRestoreEvidenceSchema.safeParse(body)

  if (!parsedBody.success) {
    return problemJson(context, {
      title: 'Validation failed',
      status: 422,
      detail: parsedBody.error.issues[0]?.message ?? 'The request body is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  try {
    const response = await recordRestoreDrillEvidence(
      bearerToken,
      parsedParams.data.restoreDrillId,
      {
        assetId: parsedBody.data.assetId,
        ...(parsedBody.data.storageTargetId
          ? { storageTargetId: parsedBody.data.storageTargetId }
          : {}),
        candidateStatus: parsedBody.data.candidateStatus,
        evidenceStatus: parsedBody.data.evidenceStatus,
        ...(parsedBody.data.checksumSha256
          ? { checksumSha256: parsedBody.data.checksumSha256 }
          : {}),
        ...(parsedBody.data.safeErrorClass
          ? { safeErrorClass: parsedBody.data.safeErrorClass }
          : {}),
        summary: parsedBody.data.summary,
        ...(parsedBody.data.verifiedAt ? { verifiedAt: parsedBody.data.verifiedAt } : {}),
      },
      context.get('correlationId'),
    )

    return context.json(response)
  } catch (error) {
    return mapRestoreError(context, error)
  }
})

function mapRestoreError(context: RestoreContext, error: unknown) {
  if (!(error instanceof Error)) {
    throw error
  }

  if (
    error.message.includes('Device credential was not found') ||
    error.message.includes('Device credential secret is invalid') ||
    error.message.includes('Device credential must include')
  ) {
    return problemJson(context, {
      title: 'Authentication failed',
      status: 401,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (
    error.message.includes('Device credential is not active') ||
    error.message.includes('Authenticated device must be active') ||
    error.message.includes('Authenticated device does not belong')
  ) {
    return problemJson(context, {
      title: 'Access denied',
      status: 403,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error.message.includes('Restore drill not found')) {
    return problemJson(context, {
      title: 'Restore drill not found',
      status: 404,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error.message.includes('does not belong')) {
    return problemJson(context, {
      title: 'Invalid restore evidence',
      status: 422,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  throw error
}
