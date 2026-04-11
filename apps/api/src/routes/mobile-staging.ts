import { parseApiEnv } from '@life-loop/config'
import { type Context, Hono } from 'hono'
import { z } from 'zod'

import {
  beginHostedStagingUpload,
  blockHostedStagingUpload,
  completeHostedStagingUpload,
  listHostedStagingObjects,
  reserveHostedStagingUpload,
} from '../db/hosted-staging'
import { parseBearerToken } from '../lib/bearer-token'
import { storeHostedStagingObject } from '../lib/hosted-staging-store'
import { problemJson } from '../lib/problem'

const env = parseApiEnv(process.env)

const reserveHostedStagingSchema = z.object({
  libraryId: z.string().uuid(),
  filename: z.string().trim().min(1).max(260),
  contentType: z.string().trim().min(1).max(160).optional(),
  checksumSha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i)
    .transform((checksum) => checksum.toLowerCase()),
  sizeBytes: z.coerce.number().int().min(1),
})

const listHostedStagingQuerySchema = z.object({
  libraryId: z.string().uuid().optional(),
})

const stagingObjectIdParamSchema = z.object({
  stagingObjectId: z.string().uuid(),
})

export const mobileStagingRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

type MobileStagingContext = Context<{
  Variables: {
    correlationId: string
  }
}>

mobileStagingRoutes.get('/mobile/staging', async (context) => {
  const bearerToken = getBearerToken(context)

  if (!bearerToken) {
    return authorizationRequired(context)
  }

  const parsedQuery = listHostedStagingQuerySchema.safeParse({
    libraryId: context.req.query('libraryId'),
  })

  if (!parsedQuery.success) {
    return problemJson(context, {
      title: 'Invalid query',
      status: 422,
      detail: parsedQuery.error.issues[0]?.message ?? 'The request query is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  try {
    const stagingObjects = await listHostedStagingObjects(bearerToken, parsedQuery.data.libraryId)
    return context.json({ stagingObjects })
  } catch (error) {
    return mapMobileStagingError(context, error)
  }
})

mobileStagingRoutes.post('/mobile/staging/reservations', async (context) => {
  const bearerToken = getBearerToken(context)

  if (!bearerToken) {
    return authorizationRequired(context)
  }

  const parsedBody = await parseJsonBody(context, reserveHostedStagingSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const response = await reserveHostedStagingUpload(
      bearerToken,
      {
        libraryId: parsedBody.data.libraryId,
        filename: parsedBody.data.filename,
        ...(parsedBody.data.contentType ? { contentType: parsedBody.data.contentType } : {}),
        checksumSha256: parsedBody.data.checksumSha256,
        sizeBytes: parsedBody.data.sizeBytes,
      },
      (stagingObjectId) =>
        new URL(`/v1/mobile/staging/${stagingObjectId}/object`, context.req.url).toString(),
      context.get('correlationId'),
    )

    return context.json(response, 201)
  } catch (error) {
    return mapMobileStagingError(context, error)
  }
})

mobileStagingRoutes.put('/mobile/staging/:stagingObjectId/object', async (context) => {
  const bearerToken = getBearerToken(context)

  if (!bearerToken) {
    return authorizationRequired(context)
  }

  const parsedParams = stagingObjectIdParamSchema.safeParse({
    stagingObjectId: context.req.param('stagingObjectId'),
  })

  if (!parsedParams.success) {
    return problemJson(context, {
      title: 'Invalid staging object id',
      status: 422,
      detail: parsedParams.error.issues[0]?.message ?? 'The staging object id is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  let stagingObject: Awaited<ReturnType<typeof beginHostedStagingUpload>> | undefined

  try {
    stagingObject = await beginHostedStagingUpload(bearerToken, parsedParams.data.stagingObjectId)
    const result = await storeHostedStagingObject({
      body: context.req.raw.body,
      checksumSha256: stagingObject.checksumSha256,
      objectKey: stagingObject.objectKey,
      rootDirectory: env.HOSTED_STAGING_ROOT,
      sizeBytes: Number(stagingObject.sizeBytes),
    })
    const completed = await completeHostedStagingUpload(
      bearerToken,
      parsedParams.data.stagingObjectId,
      { uploadedBytes: result.uploadedBytes },
      context.get('correlationId'),
    )

    return context.json({ stagingObject: completed }, 201)
  } catch (error) {
    if (stagingObject) {
      const safeErrorClass = safeUploadErrorClass(error)
      const safeReason = safeUploadBlockReason(safeErrorClass)

      await blockHostedStagingUpload(
        bearerToken,
        parsedParams.data.stagingObjectId,
        {
          reason: safeReason,
          safeErrorClass,
        },
        context.get('correlationId'),
      ).catch(() => undefined)

      return problemJson(context, {
        title: 'Hosted staging upload blocked',
        status: safeErrorClass === 'hosted_staging.upload_failed' ? 500 : 409,
        detail: safeReason,
        correlationId: context.get('correlationId'),
      })
    }

    return mapMobileStagingError(context, error)
  }
})

async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  context: MobileStagingContext,
  schema: TSchema,
) {
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

function authorizationRequired(context: MobileStagingContext) {
  return problemJson(context, {
    title: 'Authorization required',
    status: 401,
    detail: 'Mobile staging requests must include a Bearer iOS device credential.',
    correlationId: context.get('correlationId'),
  })
}

function getBearerToken(context: MobileStagingContext) {
  return parseBearerToken(context.req.header('authorization'))
}

function mapMobileStagingError(context: MobileStagingContext, error: unknown) {
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
    error.message.includes('does not belong') ||
    error.message.includes('iOS device credential') ||
    error.message.includes('active iOS device') ||
    error.message.includes('Device credential is not active')
  ) {
    return problemJson(context, {
      title: 'Access denied',
      status: 403,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error.message.includes('quota') || error.message.includes('2 GiB')) {
    return problemJson(context, {
      title: 'Hosted staging quota exceeded',
      status: 409,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error.message.includes('not found')) {
    return problemJson(context, {
      title: 'Hosted staging object not found',
      status: 404,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (
    error.message.includes('expired') ||
    error.message.includes('writable state') ||
    error.message.includes('in progress') ||
    error.message.includes('body is required') ||
    error.message.includes('byte count') ||
    error.message.includes('checksum') ||
    error.message.includes('object size') ||
    error.message.includes('object key')
  ) {
    return problemJson(context, {
      title: 'Hosted staging upload blocked',
      status: 409,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  throw error
}

function safeUploadErrorClass(error: unknown) {
  if (!(error instanceof Error)) {
    return 'hosted_staging.upload_failed'
  }

  if (error.message.includes('checksum')) {
    return 'hosted_staging.checksum_mismatch'
  }

  if (error.message.includes('byte count') || error.message.includes('object size')) {
    return 'hosted_staging.size_mismatch'
  }

  if (error.message.includes('body is required')) {
    return 'hosted_staging.missing_body'
  }

  if (error.message.includes('object key')) {
    return 'hosted_staging.invalid_object_key'
  }

  return 'hosted_staging.upload_failed'
}

function safeUploadBlockReason(safeErrorClass: string) {
  switch (safeErrorClass) {
    case 'hosted_staging.checksum_mismatch':
      return 'Upload checksum does not match reservation.'
    case 'hosted_staging.size_mismatch':
      return 'Upload size does not match reservation.'
    case 'hosted_staging.missing_body':
      return 'Upload request body is required.'
    case 'hosted_staging.invalid_object_key':
      return 'Hosted staging object key is invalid.'
    default:
      return 'Hosted staging upload failed.'
  }
}
