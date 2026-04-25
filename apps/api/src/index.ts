// Sentry instrumentation MUST be the first import — registers async hooks
// before Hono / serve() starts handling requests.
import './instrument'

import * as Sentry from '@sentry/node'
import { serve } from '@hono/node-server'

import { createLogger, parseApiEnv } from '@life-loop/config'

import { app } from './app'

// Global error handler — forward unhandled to Sentry. Hono's onError fires
// for any thrown exception in middleware or route handlers.
app.onError((err, c) => {
  Sentry.captureException(err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

const env = parseApiEnv(process.env)
const logger = createLogger('api', env.LOG_LEVEL)

serve(
  {
    fetch: app.fetch,
    hostname: env.API_HOST,
    port: env.API_PORT,
  },
  (info) => {
    logger.info('api.started', {
      host: info.address,
      port: info.port,
    })
  },
)
