import type { PoolClient } from 'pg'

export interface AuditEventInsert {
  libraryId: string | null
  actorType: 'user' | 'system'
  actorId: string | null
  eventType: string
  correlationId: string
  payload: Record<string, unknown>
}

export async function insertAuditEvent(client: PoolClient, input: AuditEventInsert) {
  await client.query(
    `
      insert into audit_events (library_id, actor_type, actor_id, event_type, correlation_id, payload)
      values ($1::uuid, $2, $3, $4, $5::uuid, $6::jsonb)
    `,
    [
      input.libraryId,
      input.actorType,
      input.actorId,
      input.eventType,
      input.correlationId,
      JSON.stringify(input.payload),
    ],
  )
}
