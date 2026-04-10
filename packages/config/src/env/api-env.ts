import { z } from 'zod'

import { parseSharedEnv } from './shared'

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url().default('postgres://lifeloop:lifeloop@localhost:5434/lifeloop'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CLERK_ISSUER_URL: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : undefined
  }, z.string().url().optional()),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
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
