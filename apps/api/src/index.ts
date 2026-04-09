import { serve } from '@hono/node-server'

import { createLogger, parseApiEnv } from '@life-loop/config'

import { app } from './app'

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
