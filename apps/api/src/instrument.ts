/**
 * Sentry instrumentation for Hono API — must be the FIRST import in
 * src/index.ts so async hooks register before the server starts.
 */
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

const dsn = process.env.SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE ?? process.env.GIT_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [nodeProfilingIntegration()],
  beforeSend(event) {
    if (process.env.NODE_ENV !== 'production') return null
    return event
  },
})
