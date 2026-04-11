import type {
  HostedStagingObject,
  ReserveHostedStagingUploadInput,
  ReserveHostedStagingUploadResponse,
} from '@life-loop/shared-types'
import type { PoolClient } from 'pg'

import {
  assertHostedStagingQuota,
  createCompletedRetentionExpiry,
  createHostedStagingObjectKey,
  createReservationExpiry,
} from '../lib/hosted-staging-policy'
import { insertAuditEvent } from './audit'
import { getDatabasePool } from './client'
import { authenticateDeviceCredential } from './device-auth'

type HostedStagingObjectRow = Omit<HostedStagingObject, 'sizeBytes' | 'uploadedBytes'> & {
  objectKey: string
  sizeBytes: string
  uploadedBytes: string
}

type QuotaRow = {
  pendingBytes: string
  pendingObjectCount: number
}

export async function reserveHostedStagingUpload(
  authorizationToken: string,
  input: ReserveHostedStagingUploadInput,
  uploadUrlFactory: (stagingObjectId: string) => string,
  correlationId: string,
): Promise<ReserveHostedStagingUploadResponse> {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const device = await authenticateDeviceCredential(client, authorizationToken)
    assertIosDeviceCanStage(device, input.libraryId)

    const quota = await readQuotaForLibrary(client, input.libraryId)
    assertHostedStagingQuota({
      pendingBytes: Number(quota.pendingBytes),
      pendingObjectCount: quota.pendingObjectCount,
      requestedSizeBytes: input.sizeBytes,
    })

    const { objectKey, stagingObjectId } = createHostedStagingObjectKey({
      libraryId: input.libraryId,
    })
    const expiresAt = createReservationExpiry()
    const result = await client.query<HostedStagingObjectRow>(
      `
        insert into hosted_staging_objects (
          id,
          library_id,
          device_id,
          object_key,
          filename,
          content_type,
          checksum_sha256,
          size_bytes,
          status,
          expires_at
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, 'reserved', $9::timestamptz)
        returning
          ${hostedStagingObjectSelectSql}
      `,
      [
        stagingObjectId,
        input.libraryId,
        device.id,
        objectKey,
        input.filename,
        input.contentType ?? null,
        input.checksumSha256,
        input.sizeBytes,
        expiresAt,
      ],
    )
    const stagingObject = result.rows[0]

    if (!stagingObject) {
      throw new Error('Hosted staging reservation insert did not return a row.')
    }

    await insertAuditEvent(client, {
      actorId: device.id,
      actorType: 'device',
      correlationId,
      eventType: 'hosted_staging.reserved',
      libraryId: device.libraryId,
      payload: {
        deviceId: device.id,
        filename: input.filename,
        sizeBytes: input.sizeBytes,
        stagingObjectId: stagingObject.id,
      },
    })

    await client.query('commit')

    return {
      stagingObject: mapHostedStagingObjectRow(stagingObject),
      upload: {
        method: 'PUT',
        url: uploadUrlFactory(stagingObject.id),
        expiresAt,
      },
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function beginHostedStagingUpload(
  authorizationToken: string,
  stagingObjectId: string,
) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')
    const device = await authenticateDeviceCredential(client, authorizationToken)
    const stagingObject = await findStagingObjectForDevice(client, stagingObjectId, device.id, true)

    if (!stagingObject) {
      throw new Error('Hosted staging object not found.')
    }

    assertIosDeviceCanStage(device, stagingObject.libraryId)

    if (stagingObject.status !== 'reserved' && stagingObject.status !== 'uploading') {
      throw new Error('Hosted staging upload is not in a writable state.')
    }

    if (Date.parse(stagingObject.expiresAt) <= Date.now()) {
      throw new Error('Hosted staging reservation has expired.')
    }

    await client.query(
      `
        update hosted_staging_objects
        set
          status = 'uploading',
          updated_at = now()
        where id = $1::uuid
      `,
      [stagingObject.id],
    )

    await client.query('commit')
    return stagingObject
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function completeHostedStagingUpload(
  authorizationToken: string,
  stagingObjectId: string,
  input: { uploadedBytes: number },
  correlationId: string,
) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')
    const device = await authenticateDeviceCredential(client, authorizationToken)
    const stagingObject = await findStagingObjectForDevice(client, stagingObjectId, device.id, true)

    if (!stagingObject) {
      throw new Error('Hosted staging object not found.')
    }

    if (stagingObject.status !== 'uploading') {
      throw new Error('Hosted staging upload is not in progress.')
    }

    const completedAt = new Date().toISOString()
    const retentionExpiresAt = createCompletedRetentionExpiry(new Date(completedAt))
    const result = await client.query<HostedStagingObjectRow>(
      `
        update hosted_staging_objects
        set
          status = 'staged',
          uploaded_bytes = $2,
          completed_at = $3::timestamptz,
          expires_at = $4::timestamptz,
          updated_at = now()
        where id = $1::uuid
        returning
          ${hostedStagingObjectSelectSql}
      `,
      [stagingObject.id, input.uploadedBytes, completedAt, retentionExpiresAt],
    )
    const updated = result.rows[0]

    if (!updated) {
      throw new Error('Hosted staging upload completion did not return a row.')
    }

    await insertAuditEvent(client, {
      actorId: device.id,
      actorType: 'device',
      correlationId,
      eventType: 'hosted_staging.uploaded',
      libraryId: device.libraryId,
      payload: {
        deviceId: device.id,
        sizeBytes: Number(updated.sizeBytes),
        stagingObjectId: updated.id,
        status: updated.status,
      },
    })

    await client.query('commit')
    return mapHostedStagingObjectRow(updated)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function blockHostedStagingUpload(
  authorizationToken: string,
  stagingObjectId: string,
  input: { reason: string; safeErrorClass: string },
  correlationId: string,
) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')
    const device = await authenticateDeviceCredential(client, authorizationToken)
    const result = await client.query<HostedStagingObjectRow>(
      `
        update hosted_staging_objects
        set
          status = 'blocked',
          blocked_reason = $3,
          safe_error_class = $4,
          updated_at = now()
        where id = $1::uuid
          and device_id = $2::uuid
        returning
          ${hostedStagingObjectSelectSql}
      `,
      [stagingObjectId, device.id, input.reason, input.safeErrorClass],
    )
    const updated = result.rows[0]

    if (!updated) {
      throw new Error('Hosted staging object not found.')
    }

    await insertAuditEvent(client, {
      actorId: device.id,
      actorType: 'device',
      correlationId,
      eventType: 'hosted_staging.blocked',
      libraryId: device.libraryId,
      payload: {
        deviceId: device.id,
        reason: input.reason,
        safeErrorClass: input.safeErrorClass,
        stagingObjectId,
      },
    })

    await client.query('commit')
    return mapHostedStagingObjectRow(updated)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function listHostedStagingObjects(authorizationToken: string, libraryId?: string) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    const device = await authenticateDeviceCredential(client, authorizationToken)
    const scopedLibraryId = libraryId ?? device.libraryId

    if (scopedLibraryId !== device.libraryId) {
      throw new Error('Authenticated device does not belong to the requested library.')
    }

    const result = await client.query<HostedStagingObjectRow>(
      `
        select
          ${hostedStagingObjectSelectSql}
        from hosted_staging_objects hso
        where hso.library_id = $1::uuid
          and hso.device_id = $2::uuid
        order by hso.created_at desc
        limit 50
      `,
      [scopedLibraryId, device.id],
    )

    return result.rows.map(mapHostedStagingObjectRow)
  } finally {
    client.release()
  }
}

const hostedStagingObjectSelectSql = `
  hso.id::text,
  hso.library_id::text as "libraryId",
  hso.device_id::text as "deviceId",
  hso.asset_id::text as "assetId",
  hso.object_key as "objectKey",
  hso.status,
  hso.filename,
  hso.content_type as "contentType",
  hso.checksum_sha256 as "checksumSha256",
  hso.size_bytes::text as "sizeBytes",
  hso.uploaded_bytes::text as "uploadedBytes",
  to_char(hso.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "expiresAt",
  to_char(
    hso.retention_eligible_at at time zone 'utc',
    'YYYY-MM-DD"T"HH24:MI:SS"Z"'
  ) as "retentionEligibleAt",
  to_char(hso.completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "completedAt",
  hso.blocked_reason as "blockedReason",
  hso.safe_error_class as "safeErrorClass",
  to_char(hso.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
  to_char(hso.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
`

function assertIosDeviceCanStage(
  device: { libraryId: string; platform: string; status: string },
  libraryId: string,
) {
  if (device.libraryId !== libraryId) {
    throw new Error('Authenticated device does not belong to the requested library.')
  }

  if (device.platform !== 'ios') {
    throw new Error('Hosted staging uploads require an iOS device credential.')
  }

  if (device.status !== 'active') {
    throw new Error('Hosted staging uploads require an active iOS device.')
  }
}

async function readQuotaForLibrary(client: PoolClient, libraryId: string) {
  const result = await client.query<QuotaRow>(
    `
      select
        coalesce(sum(size_bytes), 0)::text as "pendingBytes",
        count(id)::int as "pendingObjectCount"
      from hosted_staging_objects
      where library_id = $1::uuid
        and status in ('reserved', 'uploading', 'staged', 'archiving', 'blocked')
    `,
    [libraryId],
  )

  return result.rows[0] ?? { pendingBytes: '0', pendingObjectCount: 0 }
}

async function findStagingObjectForDevice(
  client: PoolClient,
  stagingObjectId: string,
  deviceId: string,
  forUpdate: boolean,
) {
  const result = await client.query<HostedStagingObjectRow>(
    `
      select
        ${hostedStagingObjectSelectSql}
      from hosted_staging_objects hso
      where hso.id = $1::uuid
        and hso.device_id = $2::uuid
      ${forUpdate ? 'for update' : ''}
      limit 1
    `,
    [stagingObjectId, deviceId],
  )

  return result.rows[0]
}

function mapHostedStagingObjectRow(row: HostedStagingObjectRow): HostedStagingObject {
  return {
    id: row.id,
    libraryId: row.libraryId,
    deviceId: row.deviceId,
    ...(row.assetId ? { assetId: row.assetId } : {}),
    status: row.status,
    filename: row.filename,
    ...(row.contentType ? { contentType: row.contentType } : {}),
    checksumSha256: row.checksumSha256,
    sizeBytes: Number(row.sizeBytes),
    uploadedBytes: Number(row.uploadedBytes),
    expiresAt: row.expiresAt,
    ...(row.retentionEligibleAt ? { retentionEligibleAt: row.retentionEligibleAt } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
    ...(row.blockedReason ? { blockedReason: row.blockedReason } : {}),
    ...(row.safeErrorClass ? { safeErrorClass: row.safeErrorClass } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
