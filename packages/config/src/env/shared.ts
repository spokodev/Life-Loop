import { z } from 'zod'

const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development')

export const sharedEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
})

export type SharedEnv = z.infer<typeof sharedEnvSchema>

export function parseSharedEnv(input: NodeJS.ProcessEnv): SharedEnv {
  return sharedEnvSchema.parse(input)
}

export function parseBooleanFlag(value: string | undefined): boolean {
  return value === 'true'
}
