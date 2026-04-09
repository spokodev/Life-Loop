import { z } from 'zod'

import { parseSharedEnv } from './shared'

const webEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
})

export type WebEnv = z.infer<typeof webEnvSchema> & {
  clerkEnabled: boolean
}

export function parseWebEnv(input: NodeJS.ProcessEnv): WebEnv {
  const shared = parseSharedEnv(input)
  const env = webEnvSchema.parse({
    ...input,
    NODE_ENV: shared.NODE_ENV,
  })

  const clerkConfigured = Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY)

  if (env.NODE_ENV === 'production' && !clerkConfigured) {
    throw new Error('Clerk keys are required for the production web app.')
  }

  if (Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) !== Boolean(env.CLERK_SECRET_KEY)) {
    throw new Error(
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY must be configured together.',
    )
  }

  return {
    ...env,
    clerkEnabled: clerkConfigured,
  }
}
