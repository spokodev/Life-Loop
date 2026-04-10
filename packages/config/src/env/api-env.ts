import { z } from 'zod'

import { parseSharedEnv } from './shared'

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}, z.string().min(1).optional())

const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().url().default('postgres://lifeloop:lifeloop@localhost:5434/lifeloop'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
    DEVICE_HEARTBEAT_STALE_AFTER_SECONDS: z.coerce.number().int().min(15).max(86_400).default(120),
    CLERK_ISSUER_URL: optionalTrimmedString.pipe(z.string().url().optional()),
    CLERK_SECRET_KEY: optionalTrimmedString,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((env, context) => {
    if (env.CLERK_ISSUER_URL && !env.CLERK_SECRET_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLERK_SECRET_KEY'],
        message: 'CLERK_SECRET_KEY is required when CLERK_ISSUER_URL enables API auth.',
      })
    }
  })

export type ApiEnv = z.infer<typeof apiEnvSchema> & {
  authEnabled: boolean
}

export function parseApiEnv(input: NodeJS.ProcessEnv): ApiEnv {
  const shared = parseSharedEnv(input)
  const env = apiEnvSchema.parse({
    ...input,
    NODE_ENV: shared.NODE_ENV,
  })

  return {
    ...env,
    authEnabled: Boolean(env.CLERK_ISSUER_URL),
  }
}
