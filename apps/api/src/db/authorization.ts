import type { PoolClient } from 'pg'

export async function assertLibraryOwnedByClerkUser(
  client: PoolClient,
  libraryId: string,
  clerkUserId: string,
) {
  const result = await client.query<{ id: string }>(
    `
      select l.id::text
      from libraries l
      inner join users u on u.id = l.owner_user_id
      where l.id = $1::uuid
        and u.clerk_user_id = $2
      limit 1
    `,
    [libraryId, clerkUserId],
  )

  if (!result.rows[0]) {
    throw new Error('Authenticated user does not own the requested library.')
  }
}
