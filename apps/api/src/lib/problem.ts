import type { Context } from 'hono'

type ProblemStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503

export interface ProblemDetails {
  type?: string
  title: string
  status: ProblemStatus
  detail: string
  correlationId: string
}

export function problemJson(context: Context, problem: ProblemDetails) {
  return context.json(
    {
      type: problem.type ?? 'about:blank',
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      correlationId: problem.correlationId,
    },
    problem.status,
  )
}
