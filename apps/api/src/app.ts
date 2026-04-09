import { createLogger, parseApiEnv } from '@life-loop/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { correlationIdHeader, createCorrelationId } from './lib/correlation-id'
import { problemJson } from './lib/problem'
import { healthRoutes } from './routes/health'
import { systemRoutes } from './routes/system'

type AppBindings = {
  Variables: {
    correlationId: string
  }
}

const env = parseApiEnv(process.env)
const logger = createLogger('api', env.LOG_LEVEL)

export const app = new Hono<AppBindings>()

app.use('*', cors({ origin: env.CORS_ORIGIN }))

app.use('*', async (context, next) => {
  const correlationId = createCorrelationId(context.req.header(correlationIdHeader))
  context.set('correlationId', correlationId)
  context.header(correlationIdHeader, correlationId)

  const startedAt = performance.now()

  await next()

  logger.info('request.complete', {
    correlationId,
    durationMs: Math.round(performance.now() - startedAt),
    method: context.req.method,
    path: context.req.path,
    status: context.res.status,
  })
})

app.get('/', (context) =>
  context.json({
    service: 'life-loop-api',
    message: 'Control plane API shell is running.',
    authEnabled: env.authEnabled,
  }),
)

app.route('/health', healthRoutes)
app.route('/v1', systemRoutes)

app.notFound((context) =>
  problemJson(context, {
    title: 'Not found',
    status: 404,
    detail: `Route ${context.req.method} ${context.req.path} does not exist.`,
    correlationId: context.get('correlationId'),
  }),
)

app.onError((error, context) => {
  logger.error('request.error', {
    correlationId: context.get('correlationId'),
    errorMessage: error.message,
  })

  return problemJson(context, {
    title: 'Unhandled server error',
    status: 500,
    detail: 'The control plane failed to process the request.',
    correlationId: context.get('correlationId'),
  })
})
