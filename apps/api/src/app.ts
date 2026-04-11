import { createLogger, parseApiEnv } from '@life-loop/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { correlationIdHeader, createCorrelationId } from './lib/correlation-id'
import { problemJson } from './lib/problem'
import { activityRoutes } from './routes/activity'
import { assetsRoutes } from './routes/assets'
import { billingRoutes } from './routes/billing'
import { cleanupRoutes } from './routes/cleanup'
import { deviceAuthRoutes } from './routes/device-auth'
import { healthRoutes } from './routes/health'
import { jobsRoutes } from './routes/jobs'
import { registryRoutes } from './routes/registry'
import { restoreRoutes } from './routes/restore'
import { storageRoutes } from './routes/storage'
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
app.route('/v1', deviceAuthRoutes)
app.route('/v1', assetsRoutes)
app.route('/v1', activityRoutes)
app.route('/v1', billingRoutes)
app.route('/v1', cleanupRoutes)
app.route('/v1', registryRoutes)
app.route('/v1', jobsRoutes)
app.route('/v1', restoreRoutes)
app.route('/v1', storageRoutes)

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
