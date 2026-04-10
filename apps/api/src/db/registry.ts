import { createHash, randomBytes } from 'node:crypto'

import type {
  CreateDeviceInput,
  CreateDeviceResponse,
  CreateLibraryInput,
  CreateStorageTargetInput,
  Device,
  Library,
  OwnerIdentityInput,
  StorageTarget,
} from '@life-loop/shared-types'
import type { PoolClient } from 'pg'

import { insertAuditEvent } from './audit'
import { getDatabasePool } from './client'

const enrollmentTokenTtlMinutes = 15

export async function listLibraries() {
  const databasePool = getDatabasePool()
  const result = await databasePool.query<Library>(
    `
      select
        l.id::text,
        l.slug,
        l.name,
        l.description,
        coalesce(count(a.id), 0)::int as "assetCount"
      from libraries l
      left join assets a on a.library_id = l.id
      group by l.id
      order by l.created_at asc
    `,
  )

  return result.rows
}

export async function listDevices(libraryId?: string) {
  const databasePool = getDatabasePool()
  const result = libraryId
    ? await databasePool.query<Device>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            name,
            platform,
            status,
            to_char(last_seen_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastSeenAt"
          from devices
          where library_id = $1::uuid
          order by created_at desc
        `,
        [libraryId],
      )
    : await databasePool.query<Device>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            name,
            platform,
            status,
            to_char(last_seen_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastSeenAt"
          from devices
          order by created_at desc
        `,
      )

  return result.rows
}

export async function listStorageTargets(libraryId?: string) {
  const databasePool = getDatabasePool()
  const result = libraryId
    ? await databasePool.query<StorageTarget>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            name,
            role,
            provider,
            writable,
            healthy,
            health_state as "healthState"
          from storage_targets
          where library_id = $1::uuid
          order by created_at asc
        `,
        [libraryId],
      )
    : await databasePool.query<StorageTarget>(
        `
          select
            id::text,
            library_id::text as "libraryId",
            name,
            role,
            provider,
            writable,
            healthy,
            health_state as "healthState"
          from storage_targets
          order by created_at asc
        `,
      )

  return result.rows
}

export async function createLibraryRecord(
  input: CreateLibraryInput,
  correlationId: string,
  authEnabled: boolean,
) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const userId = await upsertOwner(client, input.owner, authEnabled)
    const libraryResult = await client.query<Library>(
      `
        insert into libraries (owner_user_id, slug, name, description)
        values ($1::uuid, $2, $3, $4)
        returning
          id::text,
          slug,
          name,
          description,
          0::int as "assetCount"
      `,
      [userId, input.library.slug, input.library.name, input.library.description ?? null],
    )

    const library = libraryResult.rows[0]

    if (!library) {
      throw new Error('Library insert did not return a row.')
    }

    await insertAuditEvent(client, {
      actorId: input.owner.clerkUserId ?? input.owner.email,
      actorType: 'user',
      correlationId,
      eventType: 'library.created',
      libraryId: library.id,
      payload: {
        topology: input.library.topology,
        slug: input.library.slug,
      },
    })

    await client.query('commit')

    return library
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function createDeviceRecord(input: CreateDeviceInput, correlationId: string) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const deviceResult = await client.query<Device>(
      `
        insert into devices (library_id, name, platform, status)
        values ($1::uuid, $2, $3, 'pending')
        returning
          id::text,
          library_id::text as "libraryId",
          name,
          platform,
          status,
          null::text as "lastSeenAt"
      `,
      [input.libraryId, input.device.name, input.device.platform],
    )

    const device = deviceResult.rows[0]

    if (!device) {
      throw new Error('Device insert did not return a row.')
    }

    const enrollmentToken = randomBytes(24).toString('base64url')
    const enrollmentTokenHash = createHash('sha256').update(enrollmentToken).digest('hex')
    const expiresAt = new Date(Date.now() + enrollmentTokenTtlMinutes * 60_000).toISOString()

    await client.query(
      `
        insert into device_enrollment_tokens (device_id, library_id, token_hash, expires_at)
        values ($1::uuid, $2::uuid, $3, $4::timestamptz)
      `,
      [device.id, input.libraryId, enrollmentTokenHash, expiresAt],
    )

    await insertAuditEvent(client, {
      actorId: input.requestedBy?.clerkUserId ?? input.requestedBy?.email ?? null,
      actorType: input.requestedBy ? 'user' : 'system',
      correlationId,
      eventType: 'device.enrollment_token_created',
      libraryId: input.libraryId,
      payload: {
        deviceId: device.id,
        expiresAt,
        platform: input.device.platform,
      },
    })

    await client.query('commit')

    const response: CreateDeviceResponse = {
      device,
      enrollmentToken: {
        token: enrollmentToken,
        expiresAt,
      },
    }

    return response
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function createStorageTargetRecord(
  input: CreateStorageTargetInput,
  correlationId: string,
) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const storageTargetResult = await client.query<StorageTarget>(
      `
        insert into storage_targets (
          library_id,
          name,
          provider,
          role,
          writable,
          healthy,
          health_state
        )
        values ($1::uuid, $2, $3, $4, $5, false, 'needs_review')
        returning
          id::text,
          library_id::text as "libraryId",
          name,
          role,
          provider,
          writable,
          healthy,
          health_state as "healthState"
      `,
      [
        input.libraryId,
        input.storageTarget.name,
        input.storageTarget.provider,
        input.storageTarget.role,
        input.storageTarget.writable,
      ],
    )

    const storageTarget = storageTargetResult.rows[0]

    if (!storageTarget) {
      throw new Error('Storage target insert did not return a row.')
    }

    await insertAuditEvent(client, {
      actorId: input.requestedBy?.clerkUserId ?? input.requestedBy?.email ?? null,
      actorType: input.requestedBy ? 'user' : 'system',
      correlationId,
      eventType: 'storage_target.created',
      libraryId: input.libraryId,
      payload: {
        role: input.storageTarget.role,
        provider: input.storageTarget.provider,
      },
    })

    await client.query('commit')

    return storageTarget
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function upsertOwner(
  client: PoolClient,
  owner: OwnerIdentityInput,
  authEnabled: boolean,
): Promise<string> {
  if (authEnabled && !owner.clerkUserId) {
    throw new Error('Clerk user id is required while auth is enabled.')
  }

  const existingUserResult = await client.query<{
    id: string
    clerk_user_id: string | null
  }>(
    `
      select id::text, clerk_user_id
      from users
      where email = $1
      limit 1
    `,
    [owner.email],
  )

  const existingUser = existingUserResult.rows[0]

  if (existingUser) {
    if (
      existingUser.clerk_user_id &&
      owner.clerkUserId &&
      existingUser.clerk_user_id !== owner.clerkUserId
    ) {
      throw new Error('Email is already linked to a different Clerk user.')
    }

    const updateResult = await client.query<{ id: string }>(
      `
        update users
        set
          clerk_user_id = coalesce(clerk_user_id, $2),
          display_name = coalesce($3, display_name),
          updated_at = now()
        where id = $1::uuid
        returning id::text
      `,
      [existingUser.id, owner.clerkUserId ?? null, owner.displayName ?? null],
    )

    const updatedUser = updateResult.rows[0]

    if (!updatedUser) {
      throw new Error('User update did not return a row.')
    }

    return updatedUser.id
  }

  const insertResult = await client.query<{ id: string }>(
    `
      insert into users (clerk_user_id, email, display_name)
      values ($1, $2, $3)
      returning id::text
    `,
    [owner.clerkUserId ?? null, owner.email, owner.displayName ?? null],
  )

  const insertedUser = insertResult.rows[0]

  if (!insertedUser) {
    throw new Error('User insert did not return a row.')
  }

  return insertedUser.id
}
