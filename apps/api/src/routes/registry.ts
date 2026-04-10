import { parseApiEnv } from '@life-loop/config'
import { storageRoles, storageTopologies } from '@life-loop/shared-types'
import { type Context, Hono } from 'hono'
import { type ZodTypeAny, z } from 'zod'

import {
  createDeviceRecord,
  createLibraryRecord,
  createStorageTargetRecord,
  listDevices,
  listLibraries,
  listStorageTargets,
  listStorageTargetsForDeviceCredential,
} from '../db/registry'
import { parseBearerToken } from '../lib/bearer-token'
import { problemJson } from '../lib/problem'

const env = parseApiEnv(process.env)

const emailOwnerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(120).optional(),
  clerkUserId: z.string().trim().min(1).max(191).optional(),
})

const createLibrarySchema = z.object({
  owner: emailOwnerSchema,
  library: z.object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().max(280).optional(),
    topology: z.enum(storageTopologies),
  }),
})

const createDeviceSchema = z.object({
  libraryId: z.string().uuid(),
  device: z.object({
    name: z.string().trim().min(1).max(120),
    platform: z.enum(['macos', 'windows', 'linux', 'ios']),
  }),
  requestedBy: emailOwnerSchema.optional(),
})

const createStorageTargetSchema = z.object({
  libraryId: z.string().uuid(),
  storageTarget: z.object({
    name: z.string().trim().min(1).max(120),
    provider: z.string().trim().min(1).max(80),
    role: z.enum(storageRoles),
    writable: z.boolean(),
  }),
  requestedBy: emailOwnerSchema.optional(),
})

const listQuerySchema = z.object({
  libraryId: z.string().uuid().optional(),
})

export const registryRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

type RegistryContext = Context<{
  Variables: {
    correlationId: string
  }
}>

registryRoutes.get('/libraries', async (context) => {
  const libraries = await listLibraries()
  return context.json({ libraries })
})

registryRoutes.post('/libraries', async (context) => {
  const parsedBody = await parseBody(context, createLibrarySchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const library = await createLibraryRecord(
      parsedBody.data,
      context.get('correlationId'),
      env.authEnabled,
    )

    return context.json({ library }, 201)
  } catch (error) {
    return mapRegistryError(context, error)
  }
})

registryRoutes.get('/devices', async (context) => {
  const parsedQuery = listQuerySchema.safeParse({
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

  const devices = await listDevices(parsedQuery.data.libraryId)
  return context.json({ devices })
})

registryRoutes.post('/devices', async (context) => {
  const parsedBody = await parseBody(context, createDeviceSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const enrollment = await createDeviceRecord(parsedBody.data, context.get('correlationId'))

    return context.json(enrollment, 201)
  } catch (error) {
    return mapRegistryError(context, error)
  }
})

registryRoutes.get('/storage-targets', async (context) => {
  const parsedQuery = listQuerySchema.safeParse({
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

  const bearerToken = getBearerToken(context)

  try {
    const storageTargets = bearerToken
      ? await listStorageTargetsForDeviceCredential(bearerToken, parsedQuery.data.libraryId)
      : await listStorageTargets(parsedQuery.data.libraryId)

    return context.json({ storageTargets })
  } catch (error) {
    return mapRegistryError(context, error)
  }
})

registryRoutes.post('/storage-targets', async (context) => {
  const parsedBody = await parseBody(context, createStorageTargetSchema)

  if (!parsedBody.success) {
    return parsedBody.response
  }

  try {
    const storageTarget = await createStorageTargetRecord(
      parsedBody.data,
      context.get('correlationId'),
    )

    return context.json({ storageTarget }, 201)
  } catch (error) {
    return mapRegistryError(context, error)
  }
})

async function parseBody<TSchema extends ZodTypeAny>(context: RegistryContext, schema: TSchema) {
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

function mapRegistryError(context: RegistryContext, error: unknown) {
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
    error.message.includes('Device has been revoked') ||
    error.message.includes('Device is paused') ||
    error.message.includes('Device credential is not active') ||
    error.message.includes('Authenticated device does not belong')
  ) {
    return problemJson(context, {
      title: 'Access denied',
      status: 403,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error instanceof Error && error.message.includes('Clerk user id is required')) {
    return problemJson(context, {
      title: 'Clerk identity required',
      status: 400,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error instanceof Error && error.message.includes('Email is already linked')) {
    return problemJson(context, {
      title: 'Owner identity conflict',
      status: 409,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return problemJson(context, {
      title: 'Duplicate record',
      status: 409,
      detail: 'A record with the same unique value already exists.',
      correlationId: context.get('correlationId'),
    })
  }

  throw error
}

function getBearerToken(context: RegistryContext) {
  return parseBearerToken(context.req.header('authorization'))
}
