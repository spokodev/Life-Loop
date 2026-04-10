import { idempotencyKeyHeader } from '@life-loop/config'
import { blobKinds, placementHealthStates, storageRoles } from '@life-loop/shared-types'
import { type Context, Hono } from 'hono'
import { z } from 'zod'

import { getAssetDetail, listAssets, reportIngestedAsset } from '../db/assets'
import { parseBearerToken } from '../lib/bearer-token'
import { problemJson } from '../lib/problem'

const assetBlobSchema = z.object({
  kind: z.enum(blobKinds),
  checksumSha256: z.string().trim().length(64),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().trim().min(1).max(160).optional(),
})

const assetPlacementSchema = z.object({
  blobKind: z.enum(blobKinds),
  storageTargetId: z.string().uuid(),
  role: z.enum(storageRoles),
  checksumSha256: z.string().trim().length(64).optional(),
  verified: z.boolean().optional(),
  healthState: z.enum(placementHealthStates).optional(),
})

const reportIngestAssetSchema = z.object({
  libraryId: z.string().uuid(),
  filename: z.string().trim().min(1).max(260),
  captureDate: z.string().datetime({ offset: true }).optional(),
  assetMetadata: z.record(z.string(), z.unknown()).optional(),
  blobs: z.array(assetBlobSchema).min(1).max(4),
  placements: z.array(assetPlacementSchema).min(1).max(12),
})

const listAssetsQuerySchema = z.object({
  libraryId: z.string().uuid().optional(),
})

const assetIdParamSchema = z.object({
  assetId: z.string().uuid(),
})

export const assetsRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

type AssetsContext = Context<{
  Variables: {
    correlationId: string
  }
}>

assetsRoutes.get('/assets', async (context) => {
  const parsedQuery = listAssetsQuerySchema.safeParse({
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

  const assets = await listAssets(parsedQuery.data.libraryId)
  return context.json({ assets })
})

assetsRoutes.get('/assets/:assetId', async (context) => {
  const parsedParams = assetIdParamSchema.safeParse({
    assetId: context.req.param('assetId'),
  })

  if (!parsedParams.success) {
    return problemJson(context, {
      title: 'Invalid asset id',
      status: 422,
      detail: parsedParams.error.issues[0]?.message ?? 'The asset id is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  const assetDetail = await getAssetDetail(parsedParams.data.assetId)

  if (!assetDetail) {
    return problemJson(context, {
      title: 'Asset not found',
      status: 404,
      detail: 'The requested asset does not exist.',
      correlationId: context.get('correlationId'),
    })
  }

  return context.json(assetDetail)
})

assetsRoutes.post('/assets/report-ingest', async (context) => {
  const idempotencyKey = context.req.header(idempotencyKeyHeader)?.trim()

  if (!idempotencyKey) {
    return problemJson(context, {
      title: 'Idempotency key required',
      status: 400,
      detail: `Header ${idempotencyKeyHeader} is required for ingest reports.`,
      correlationId: context.get('correlationId'),
    })
  }

  const bearerToken = getBearerToken(context)

  if (!bearerToken) {
    return problemJson(context, {
      title: 'Authorization required',
      status: 401,
      detail: 'Asset ingest reports must include a Bearer device credential.',
      correlationId: context.get('correlationId'),
    })
  }

  const parsedBody = await parseBody(context)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const response = await reportIngestedAsset(
      bearerToken,
      normalizeReportIngestAssetInput(parsedBody.data),
      context.get('correlationId'),
      idempotencyKey,
    )

    return context.json(response, response.replayed ? 200 : 201)
  } catch (error) {
    return mapAssetError(context, error)
  }
})

async function parseBody(context: AssetsContext) {
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

  const result = reportIngestAssetSchema.safeParse(json)

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

function getBearerToken(context: AssetsContext) {
  return parseBearerToken(context.req.header('authorization'))
}

function mapAssetError(context: AssetsContext, error: unknown) {
  if (!(error instanceof Error)) {
    throw error
  }

  if (
    error.message.includes('Device credential') ||
    error.message.includes('Authenticated device does not belong')
  ) {
    return problemJson(context, {
      title: 'Authentication failed',
      status: 401,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (
    error.message.includes('must be active') ||
    error.message.includes('Ingest reports require')
  ) {
    return problemJson(context, {
      title: 'Blocked ingest report',
      status: 409,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error.message.includes('Storage target') || error.message.includes('Placement references')) {
    return problemJson(context, {
      title: 'Invalid placement report',
      status: 422,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  throw error
}

function normalizeReportIngestAssetInput(data: z.infer<typeof reportIngestAssetSchema>) {
  return {
    libraryId: data.libraryId,
    filename: data.filename,
    ...(data.captureDate ? { captureDate: data.captureDate } : {}),
    ...(data.assetMetadata ? { assetMetadata: data.assetMetadata } : {}),
    blobs: data.blobs.map((blob) => ({
      kind: blob.kind,
      checksumSha256: blob.checksumSha256,
      sizeBytes: blob.sizeBytes,
      ...(blob.mimeType ? { mimeType: blob.mimeType } : {}),
    })),
    placements: data.placements.map((placement) => ({
      blobKind: placement.blobKind,
      storageTargetId: placement.storageTargetId,
      role: placement.role,
      ...(placement.checksumSha256 ? { checksumSha256: placement.checksumSha256 } : {}),
      ...(placement.verified !== undefined ? { verified: placement.verified } : {}),
      ...(placement.healthState ? { healthState: placement.healthState } : {}),
    })),
  }
}
