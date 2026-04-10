import { parseApiEnv } from '@life-loop/config'
import { type Context, Hono } from 'hono'
import { type ZodTypeAny, z } from 'zod'

import {
  recordDeviceHeartbeat,
  redeemDeviceEnrollmentToken,
  revokeDevice,
  rotateDeviceCredential,
} from '../db/device-auth'
import { parseBearerToken } from '../lib/bearer-token'
import { problemJson } from '../lib/problem'
import { resolveUserActor, UserAuthError } from '../lib/user-auth'

const env = parseApiEnv(process.env)

const emailOwnerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(120).optional(),
  clerkUserId: z.string().trim().min(1).max(191).optional(),
})

const redeemSchema = z.object({
  enrollmentToken: z.string().trim().min(16).max(512),
})

const heartbeatSchema = z.object({
  observedAt: z.string().datetime({ offset: true }).optional(),
  hostname: z.string().trim().min(1).max(120).optional(),
  agentVersion: z.string().trim().min(1).max(80).optional(),
})

const rotateSchema = z.object({
  requestedBy: emailOwnerSchema.optional(),
})

const revokeSchema = z.object({
  reason: z.string().trim().min(1).max(240).optional(),
  requestedBy: emailOwnerSchema.optional(),
})

const deviceIdParamSchema = z.object({
  deviceId: z.string().uuid(),
})

export const deviceAuthRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

type DeviceAuthContext = Context<{
  Variables: {
    correlationId: string
  }
}>

deviceAuthRoutes.post('/device-auth/redeem', async (context) => {
  const parsedBody = await parseBody(context, redeemSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const response = await redeemDeviceEnrollmentToken(
      parsedBody.data,
      context.get('correlationId'),
    )
    return context.json(response, 201)
  } catch (error) {
    return mapDeviceAuthError(context, error)
  }
})

deviceAuthRoutes.post('/device-auth/heartbeat', async (context) => {
  const parsedBody = await parseBody(context, heartbeatSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  const bearerToken = getBearerToken(context)

  if (!bearerToken) {
    return problemJson(context, {
      title: 'Authorization required',
      status: 401,
      detail: 'Device heartbeat requests must include a Bearer device credential.',
      correlationId: context.get('correlationId'),
    })
  }

  try {
    const response = await recordDeviceHeartbeat(
      bearerToken,
      parsedBody.data,
      context.get('correlationId'),
    )

    return context.json(response, 200)
  } catch (error) {
    return mapDeviceAuthError(context, error)
  }
})

deviceAuthRoutes.post('/devices/:deviceId/revoke', async (context) => {
  const parsedParams = deviceIdParamSchema.safeParse({
    deviceId: context.req.param('deviceId'),
  })

  if (!parsedParams.success) {
    return problemJson(context, {
      title: 'Invalid device id',
      status: 422,
      detail: parsedParams.error.issues[0]?.message ?? 'The device id is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  const parsedBody = await parseBody(context, revokeSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const requestedBy = await resolveUserActor({
      authorizationHeader: context.req.header('authorization'),
      bootstrapActor: parsedBody.data.requestedBy,
      env,
    })

    const device = await revokeDevice(
      parsedParams.data.deviceId,
      {
        ...parsedBody.data,
        ...(requestedBy ? { requestedBy } : {}),
      },
      context.get('correlationId'),
    )

    return context.json({ device }, 200)
  } catch (error) {
    return mapDeviceAuthError(context, error)
  }
})

deviceAuthRoutes.post('/devices/:deviceId/rotate-credential', async (context) => {
  const parsedParams = deviceIdParamSchema.safeParse({
    deviceId: context.req.param('deviceId'),
  })

  if (!parsedParams.success) {
    return problemJson(context, {
      title: 'Invalid device id',
      status: 422,
      detail: parsedParams.error.issues[0]?.message ?? 'The device id is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  const parsedBody = await parseBody(context, rotateSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const requestedBy = await resolveUserActor({
      authorizationHeader: context.req.header('authorization'),
      bootstrapActor: parsedBody.data.requestedBy,
      env,
    })

    const response = await rotateDeviceCredential(
      parsedParams.data.deviceId,
      {
        ...parsedBody.data,
        ...(requestedBy ? { requestedBy } : {}),
      },
      context.get('correlationId'),
    )

    return context.json(response, 200)
  } catch (error) {
    return mapDeviceAuthError(context, error)
  }
})

async function parseBody<TSchema extends ZodTypeAny>(context: DeviceAuthContext, schema: TSchema) {
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

function getBearerToken(context: DeviceAuthContext) {
  return parseBearerToken(context.req.header('authorization'))
}

function mapDeviceAuthError(context: DeviceAuthContext, error: unknown) {
  if (!(error instanceof Error)) {
    throw error
  }

  if (error instanceof UserAuthError) {
    return problemJson(context, {
      title: error.title,
      status: error.status,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (
    error.message.includes('Enrollment token was not found') ||
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
    error.message.includes('Enrollment token has already been consumed') ||
    error.message.includes('Device already has an active credential')
  ) {
    return problemJson(context, {
      title: 'Conflict',
      status: 409,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (
    error.message.includes('Device has been revoked') ||
    error.message.includes('Device is paused') ||
    error.message.includes('Device credential is not active') ||
    error.message.includes('Authenticated user does not own')
  ) {
    return problemJson(context, {
      title: 'Access denied',
      status: 403,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error.message.includes('Device not found')) {
    return problemJson(context, {
      title: 'Device not found',
      status: 404,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error.message.includes('Enrollment token has expired')) {
    return problemJson(context, {
      title: 'Enrollment token expired',
      status: 401,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  throw error
}
