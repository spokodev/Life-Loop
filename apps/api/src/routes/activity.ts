import { Hono } from 'hono'
import { z } from 'zod'

import { listAuditEvents } from '../db/audit'
import { problemJson } from '../lib/problem'

const listAuditEventsQuerySchema = z.object({
  libraryId: z.string().uuid().optional(),
})

export const activityRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

activityRoutes.get('/audit-events', async (context) => {
  const parsedQuery = listAuditEventsQuerySchema.safeParse({
    libraryId: context.req.query('libraryId'),
  })

  if (!parsedQuery.success) {
    return problemJson(context, {
      title: 'Invalid query',
      status: 422,
      detail: parsedQuery.error.issues[0]?.message ?? 'The request query is invalid.',
      correlationId: context.get('correlationId'),
    })
  }

  const auditEvents = await listAuditEvents(
    parsedQuery.data.libraryId ? { libraryId: parsedQuery.data.libraryId } : undefined,
  )
  return context.json({ auditEvents })
})
