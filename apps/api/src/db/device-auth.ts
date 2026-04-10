import type {
  Device,
  DeviceHeartbeatResponse,
  RedeemDeviceEnrollmentTokenResponse,
  RevokeDeviceInput,
  RotateDeviceCredentialInput,
  RotateDeviceCredentialResponse,
} from '@life-loop/shared-types'
import type { PoolClient } from 'pg'

import {
  composeDeviceCredential,
  generateDeviceSecret,
  hashDeviceSecret,
  parseDeviceCredential,
} from '../lib/device-credentials'
import { insertAuditEvent } from './audit'
import { getDatabasePool } from './client'

type DeviceRow = Device

type EnrollmentTokenRow = DeviceRow & {
  enrollmentTokenId: string
  expiresAt: string
  consumedAt?: string
}

type DeviceCredentialRow = DeviceRow & {
  credentialId: string
  credentialStatus: 'active' | 'rotated' | 'revoked'
  secretHash: string
}

const deviceSelectSql = `
  d.id::text,
  d.library_id::text as "libraryId",
  d.name,
  d.platform,
  d.status,
  to_char(d.last_seen_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastSeenAt"
`

export async function redeemDeviceEnrollmentToken(
  input: { enrollmentToken: string },
  correlationId: string,
): Promise<RedeemDeviceEnrollmentTokenResponse> {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const tokenHash = hashDeviceSecret(input.enrollmentToken)
    const enrollment = await findEnrollmentToken(client, tokenHash, true)

    if (!enrollment) {
      throw new Error('Enrollment token was not found.')
    }

    if (enrollment.consumedAt) {
      throw new Error('Enrollment token has already been consumed.')
    }

    if (Date.parse(enrollment.expiresAt) <= Date.now()) {
      throw new Error('Enrollment token has expired.')
    }

    if (enrollment.status === 'revoked') {
      throw new Error('Device has been revoked.')
    }

    const existingCredential = await findActiveCredentialByDeviceId(client, enrollment.id, true)

    if (existingCredential) {
      throw new Error('Device already has an active credential.')
    }

    const issuedAt = new Date().toISOString()
    const secret = generateDeviceSecret()
    const secretHash = hashDeviceSecret(secret)
    const credentialResult = await client.query<{ id: string }>(
      `
        insert into device_credentials (device_id, secret_hash, status)
        values ($1::uuid, $2, 'active')
        returning id::text
      `,
      [enrollment.id, secretHash],
    )

    const credential = credentialResult.rows[0]

    if (!credential) {
      throw new Error('Device credential insert did not return a row.')
    }

    await client.query(
      `
        update device_enrollment_tokens
        set
          consumed_at = now(),
          consumed_credential_id = $2::uuid
        where id = $1::uuid
      `,
      [enrollment.enrollmentTokenId, credential.id],
    )

    await insertAuditEvent(client, {
      actorId: enrollment.id,
      actorType: 'device',
      correlationId,
      eventType: 'device.credential_issued',
      libraryId: enrollment.libraryId,
      payload: {
        credentialId: credential.id,
        deviceId: enrollment.id,
        issuedAt,
      },
    })

    await client.query('commit')

    return {
      device: toDevice(enrollment),
      credential: {
        token: composeDeviceCredential(credential.id, secret),
        issuedAt,
      },
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function recordDeviceHeartbeat(
  authorizationToken: string,
  input: { observedAt?: string; hostname?: string; agentVersion?: string },
  correlationId: string,
): Promise<DeviceHeartbeatResponse> {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const credential = await authenticateDeviceCredential(client, authorizationToken)

    if (credential.status === 'revoked') {
      throw new Error('Device has been revoked.')
    }

    if (credential.status === 'paused') {
      throw new Error('Device is paused.')
    }

    const acceptedAt = input.observedAt
      ? new Date(input.observedAt).toISOString()
      : new Date().toISOString()

    await client.query(
      `
        update device_credentials
        set
          last_used_at = now(),
          updated_at = now()
        where id = $1::uuid
      `,
      [credential.credentialId],
    )

    const deviceResult = await client.query<DeviceRow>(
      `
        update devices d
        set
          status = 'active',
          last_seen_at = $2::timestamptz,
          updated_at = now()
        where d.id = $1::uuid
        returning
          ${deviceSelectSql}
      `,
      [credential.id, acceptedAt],
    )

    const device = deviceResult.rows[0]

    if (!device) {
      throw new Error('Device heartbeat update did not return a row.')
    }

    await insertAuditEvent(client, {
      actorId: device.id,
      actorType: 'device',
      correlationId,
      eventType: 'device.heartbeat_recorded',
      libraryId: device.libraryId,
      payload: {
        acceptedAt,
        agentVersion: input.agentVersion ?? null,
        credentialId: credential.credentialId,
        hostname: input.hostname ?? null,
      },
    })

    await client.query('commit')

    return {
      acceptedAt,
      device,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function revokeDevice(
  deviceId: string,
  input: RevokeDeviceInput,
  correlationId: string,
) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const currentDevice = await findDeviceById(client, deviceId, true)

    if (!currentDevice) {
      throw new Error('Device not found.')
    }

    const deviceResult = await client.query<DeviceRow>(
      `
        update devices d
        set
          status = 'revoked',
          updated_at = now()
        where d.id = $1::uuid
        returning
          ${deviceSelectSql}
      `,
      [deviceId],
    )

    const device = deviceResult.rows[0]

    if (!device) {
      throw new Error('Device revoke update did not return a row.')
    }

    await client.query(
      `
        update device_credentials
        set
          status = 'revoked',
          revoked_at = now(),
          updated_at = now()
        where device_id = $1::uuid
          and status = 'active'
      `,
      [deviceId],
    )

    await insertAuditEvent(client, {
      actorId: input.requestedBy?.clerkUserId ?? input.requestedBy?.email ?? null,
      actorType: input.requestedBy ? 'user' : 'system',
      correlationId,
      eventType: 'device.revoked',
      libraryId: device.libraryId,
      payload: {
        deviceId,
        previousStatus: currentDevice.status,
        reason: input.reason ?? null,
      },
    })

    await client.query('commit')
    return device
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function rotateDeviceCredential(
  deviceId: string,
  input: RotateDeviceCredentialInput,
  correlationId: string,
): Promise<RotateDeviceCredentialResponse> {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const device = await findDeviceById(client, deviceId, true)

    if (!device) {
      throw new Error('Device not found.')
    }

    if (device.status === 'revoked') {
      throw new Error('Device has been revoked.')
    }

    await client.query(
      `
        update device_credentials
        set
          status = 'rotated',
          revoked_at = now(),
          updated_at = now()
        where device_id = $1::uuid
          and status = 'active'
      `,
      [deviceId],
    )

    const issuedAt = new Date().toISOString()
    const secret = generateDeviceSecret()
    const secretHash = hashDeviceSecret(secret)
    const credentialResult = await client.query<{ id: string }>(
      `
        insert into device_credentials (device_id, secret_hash, status)
        values ($1::uuid, $2, 'active')
        returning id::text
      `,
      [deviceId, secretHash],
    )

    const credential = credentialResult.rows[0]

    if (!credential) {
      throw new Error('Rotated credential insert did not return a row.')
    }

    await insertAuditEvent(client, {
      actorId: input.requestedBy?.clerkUserId ?? input.requestedBy?.email ?? null,
      actorType: input.requestedBy ? 'user' : 'system',
      correlationId,
      eventType: 'device.credential_rotated',
      libraryId: device.libraryId,
      payload: {
        credentialId: credential.id,
        deviceId,
        issuedAt,
      },
    })

    await client.query('commit')

    return {
      device,
      credential: {
        token: composeDeviceCredential(credential.id, secret),
        issuedAt,
      },
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function findEnrollmentToken(client: PoolClient, tokenHash: string, forUpdate = false) {
  const result = await client.query<EnrollmentTokenRow>(
    `
      select
        t.id::text as "enrollmentTokenId",
        to_char(t.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "expiresAt",
        to_char(t.consumed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "consumedAt",
        ${deviceSelectSql}
      from device_enrollment_tokens t
      inner join devices d on d.id = t.device_id
      where t.token_hash = $1
      ${forUpdate ? 'for update of t, d' : ''}
      limit 1
    `,
    [tokenHash],
  )

  return result.rows[0]
}

async function findActiveCredentialByDeviceId(
  client: PoolClient,
  deviceId: string,
  forUpdate = false,
) {
  const result = await client.query<{ credentialId: string }>(
    `
      select id::text as "credentialId"
      from device_credentials
      where device_id = $1::uuid
        and status = 'active'
      ${forUpdate ? 'for update' : ''}
      limit 1
    `,
    [deviceId],
  )

  return result.rows[0]
}

async function findDeviceById(client: PoolClient, deviceId: string, forUpdate = false) {
  const result = await client.query<DeviceRow>(
    `
      select
        ${deviceSelectSql}
      from devices d
      where d.id = $1::uuid
      ${forUpdate ? 'for update' : ''}
      limit 1
    `,
    [deviceId],
  )

  return result.rows[0]
}

async function authenticateDeviceCredential(client: PoolClient, authorizationToken: string) {
  const parsedCredential = parseDeviceCredential(authorizationToken)
  const result = await client.query<DeviceCredentialRow>(
    `
      select
        dc.id::text as "credentialId",
        dc.secret_hash as "secretHash",
        dc.status as "credentialStatus",
        ${deviceSelectSql}
      from device_credentials dc
      inner join devices d on d.id = dc.device_id
      where dc.id = $1::uuid
      for update of dc, d
      limit 1
    `,
    [parsedCredential.credentialId],
  )

  const credential = result.rows[0]

  if (!credential) {
    throw new Error('Device credential was not found.')
  }

  if (credential.credentialStatus !== 'active') {
    throw new Error('Device credential is not active.')
  }

  if (hashDeviceSecret(parsedCredential.secret) !== credential.secretHash) {
    throw new Error('Device credential secret is invalid.')
  }

  return credential
}

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    libraryId: row.libraryId,
    name: row.name,
    platform: row.platform,
    status: row.status,
    ...(row.lastSeenAt ? { lastSeenAt: row.lastSeenAt } : {}),
  }
}
