import type { AuditEvent } from '@life-loop/shared-types'
import type { PoolClient } from 'pg'

import { getDatabasePool } from './client'

export interface AuditEventInsert {
  libraryId: string | null
  actorType: 'user' | 'device' | 'system'
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

type AuditEventRow = {
  id: string
  libraryId: string | null
  actorType: AuditEvent['actorType']
  actorId: string | null
  eventType: string
  correlationId: string
  occurredAt: string
  payload: Record<string, unknown>
}

export async function listAuditEvents(input?: { libraryId?: string }) {
  const databasePool = getDatabasePool()
  const result = input?.libraryId
    ? await databasePool.query<AuditEventRow>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            actor_type as "actorType",
            actor_id as "actorId",
            event_type as "eventType",
            correlation_id::text as "correlationId",
            to_char(occurred_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "occurredAt",
            payload
          from audit_events
          where library_id = $1::uuid
          order by occurred_at desc
          limit 50
        `,
        [input.libraryId],
      )
    : await databasePool.query<AuditEventRow>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            actor_type as "actorType",
            actor_id as "actorId",
            event_type as "eventType",
            correlation_id::text as "correlationId",
            to_char(occurred_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "occurredAt",
            payload
          from audit_events
          order by occurred_at desc
          limit 50
        `,
      )

  return result.rows.map(mapAuditEventRow)
}

function mapAuditEventRow(row: AuditEventRow): AuditEvent {
  const explained = explainAuditEvent(row.eventType, row.payload)
  const jobId = getStringPayloadValue(row.payload, 'jobId')
  const assetId = getStringPayloadValue(row.payload, 'assetId')
  const deviceId = getStringPayloadValue(row.payload, 'deviceId')

  return {
    id: row.id,
    ...(row.libraryId ? { libraryId: row.libraryId } : {}),
    actorType: row.actorType,
    ...(row.actorId ? { actorId: row.actorId } : {}),
    eventType: row.eventType,
    correlationId: row.correlationId,
    occurredAt: row.occurredAt,
    summary: explained.summary,
    ...(explained.details ? { details: explained.details } : {}),
    ...(jobId ? { jobId } : {}),
    ...(assetId ? { assetId } : {}),
    ...(deviceId ? { deviceId } : {}),
  }
}

function explainAuditEvent(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case 'library.created':
      return {
        summary: 'Library created',
        details: `${getStringPayloadValue(payload, 'slug') ?? 'Unknown slug'} was created as the archive namespace.`,
      }
    case 'device.enrollment_token_created':
      return {
        summary: 'Device enrollment issued',
        details: `A pending device was given an enrollment token for ${getStringPayloadValue(payload, 'platform') ?? 'unknown platform'}.`,
      }
    case 'storage_target.created':
      return {
        summary: 'Storage target registered',
        details: `${getStringPayloadValue(payload, 'role') ?? 'unknown role'} target using ${getStringPayloadValue(payload, 'provider') ?? 'unknown provider'} was added.`,
      }
    case 'asset.ingest_reported':
      return {
        summary: 'Asset ingest reported',
        details: `${getStringPayloadValue(payload, 'filename') ?? 'Unknown asset'} was reported with ${String(payload.placementCount ?? 0)} placements.`,
      }
    case 'job.created':
      return {
        summary: 'Job queued',
        details: `${getStringPayloadValue(payload, 'kind') ?? 'unknown job'} was queued explicitly in the control plane.`,
      }
    case 'job.status_changed':
      return {
        summary: 'Job status changed',
        details: `${getStringPayloadValue(payload, 'fromStatus') ?? 'unknown'} -> ${getStringPayloadValue(payload, 'toStatus') ?? 'unknown'}${getStringPayloadValue(payload, 'reason') ? ` • ${getStringPayloadValue(payload, 'reason')}` : ''}`,
      }
    case 'job.claimed':
      return {
        summary: 'Job claimed',
        details: `${getStringPayloadValue(payload, 'kind') ?? 'unknown job'} was leased to an authenticated device until ${getStringPayloadValue(payload, 'leaseExpiresAt') ?? 'an unknown time'}.`,
      }
    case 'job.lease_heartbeat':
      return {
        summary: 'Job lease heartbeat recorded',
        details: `The active job lease was extended until ${getStringPayloadValue(payload, 'leaseExpiresAt') ?? 'an unknown time'}.`,
      }
    case 'job.expired_leases_recovered':
      return {
        summary: 'Expired job leases recovered',
        details: `${String(payload.recoveredCount ?? 0)} running jobs were moved back to retrying by an explicit claim request.`,
      }
    case 'job.claim_completed':
      return {
        summary: 'Job claim completed',
        details: `Claimed job moved to ${getStringPayloadValue(payload, 'toStatus') ?? 'unknown'}${getStringPayloadValue(payload, 'reason') ? ` • ${getStringPayloadValue(payload, 'reason')}` : ''}.`,
      }
    case 'restore_drill.evidence_recorded':
      return {
        summary: 'Restore drill evidence recorded',
        details: `Evidence status ${getStringPayloadValue(payload, 'evidenceStatus') ?? 'unknown'} was recorded for a restore drill${getStringPayloadValue(payload, 'safeErrorClass') ? ` • ${getStringPayloadValue(payload, 'safeErrorClass')}` : ''}.`,
      }
    case 'hosted_staging.reserved':
      return {
        summary: 'Hosted staging reserved',
        details: `${getStringPayloadValue(payload, 'filename') ?? 'Unknown asset'} reserved temporary iPhone staging space.`,
      }
    case 'hosted_staging.uploaded':
      return {
        summary: 'Hosted staging uploaded',
        details:
          'A mobile upload reached hosted staging only; archive and cleanup safety remain separate.',
      }
    case 'hosted_staging.blocked':
      return {
        summary: 'Hosted staging blocked',
        details: `${getStringPayloadValue(payload, 'safeErrorClass') ?? 'hosted_staging.blocked'} • ${getStringPayloadValue(payload, 'reason') ?? 'Upload was blocked.'}`,
      }
    case 'device.credential_issued':
      return {
        summary: 'Device credential issued',
        details: 'A device redeemed its enrollment token and received an active credential.',
      }
    case 'device.heartbeat_recorded':
      return {
        summary: 'Device heartbeat recorded',
        details: `${getStringPayloadValue(payload, 'hostname') ?? 'Unknown host'} checked in with the control plane.`,
      }
    case 'device.revoked':
      return {
        summary: 'Device revoked',
        details: getStringPayloadValue(payload, 'reason') ?? 'The device was explicitly revoked.',
      }
    case 'device.credential_rotated':
      return {
        summary: 'Device credential rotated',
        details: 'An active device credential was replaced with a newly issued one.',
      }
    default:
      return {
        summary: eventType,
        details:
          'This audit event was recorded, but a specialized explanation has not been added yet.',
      }
  }
}

function getStringPayloadValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}
