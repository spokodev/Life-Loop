import { Hono } from 'hono'
import { z } from 'zod'

import { getCleanupReviewReadiness } from '../db/cleanup'
import { problemJson } from '../lib/problem'

const cleanupReviewQuerySchema = z.object({
  libraryId: z.string().uuid().optional(),
})

export const cleanupRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

cleanupRoutes.get('/cleanup/review', async (context) => {
  const parsedQuery = cleanupReviewQuerySchema.safeParse({
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

  const readiness = await getCleanupReviewReadiness(parsedQuery.data.libraryId)
  return context.json(readiness)
})
