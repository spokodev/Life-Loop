import { correlationIdHeader } from '@life-loop/config'

export { correlationIdHeader }

export function createCorrelationId(existing?: string) {
  return existing?.trim() || crypto.randomUUID()
}
