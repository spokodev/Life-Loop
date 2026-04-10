import type { BillingStatus, OwnerIdentityInput } from '@life-loop/shared-types'
import type { PoolClient } from 'pg'

import type { BillingEventProjection } from '../lib/stripe-webhook'
import { getDatabasePool } from './client'

type BillingCustomerRow = {
  clerkUserId: string
  displayName: string | null
  email: string
  stripeCustomerId: string
}

type BillingSubscriptionRow = {
  currentPeriodEnd: string | null
  latestStripeEventId: string | null
  status: string
  stripePriceId: string | null
  stripeSubscriptionId: string
}

export async function getBillingStatus(clerkUserId: string): Promise<BillingStatus> {
  const databasePool = getDatabasePool()
  const customer = await findBillingCustomerByClerkUserId(databasePool, clerkUserId)
  const subscription = await findLatestBillingSubscriptionByClerkUserId(databasePool, clerkUserId)

  return {
    ...(customer
      ? {
          customer: {
            stripeCustomerId: customer.stripeCustomerId,
            email: customer.email,
            ...(customer.displayName ? { displayName: customer.displayName } : {}),
          },
        }
      : {}),
    ...(subscription
      ? {
          subscription: {
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            status: subscription.status,
            ...(subscription.stripePriceId ? { stripePriceId: subscription.stripePriceId } : {}),
            ...(subscription.currentPeriodEnd
              ? { currentPeriodEnd: subscription.currentPeriodEnd }
              : {}),
            ...(subscription.latestStripeEventId
              ? { latestStripeEventId: subscription.latestStripeEventId }
              : {}),
          },
        }
      : {}),
  }
}

export async function findBillingCustomer(clerkUserId: string) {
  const databasePool = getDatabasePool()
  return findBillingCustomerByClerkUserId(databasePool, clerkUserId)
}

export async function upsertBillingCustomer(input: {
  actor: OwnerIdentityInput
  stripeCustomerId: string
}) {
  if (!input.actor.clerkUserId) {
    throw new Error('Clerk user id is required for billing customer records.')
  }

  const databasePool = getDatabasePool()
  const result = await databasePool.query<BillingCustomerRow>(
    `
      insert into billing_customers (clerk_user_id, email, display_name, stripe_customer_id)
      values ($1, $2, $3, $4)
      on conflict (clerk_user_id) do update
      set
        email = excluded.email,
        display_name = excluded.display_name,
        updated_at = now()
      returning
        clerk_user_id as "clerkUserId",
        email,
        display_name as "displayName",
        stripe_customer_id as "stripeCustomerId"
    `,
    [
      input.actor.clerkUserId,
      input.actor.email,
      input.actor.displayName ?? null,
      input.stripeCustomerId,
    ],
  )

  const customer = result.rows[0]

  if (!customer) {
    throw new Error('Billing customer upsert did not return a row.')
  }

  return customer
}

export async function persistBillingEventProjection(projection: BillingEventProjection) {
  const databasePool = getDatabasePool()
  const client = await databasePool.connect()

  try {
    await client.query('begin')

    const eventInsert = await client.query<{ stripeEventId: string }>(
      `
        insert into billing_events (
          stripe_event_id,
          event_type,
          livemode,
          stripe_created_at,
          processing_status,
          related_clerk_user_id,
          related_customer_id,
          related_subscription_id
        )
        values ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8)
        on conflict (stripe_event_id) do nothing
        returning stripe_event_id as "stripeEventId"
      `,
      [
        projection.stripeEventId,
        projection.eventType,
        projection.livemode,
        projection.stripeCreatedAt,
        projection.processingStatus,
        projection.relatedClerkUserId ?? null,
        projection.relatedCustomerId ?? null,
        projection.relatedSubscriptionId ?? null,
      ],
    )

    const insertedEvent = eventInsert.rows[0]

    if (!insertedEvent) {
      await client.query('commit')
      return { replayed: true }
    }

    if (projection.subscription) {
      const clerkUserId =
        projection.subscription.clerkUserId ??
        (await findClerkUserIdByStripeCustomerId(client, projection.subscription.stripeCustomerId))

      if (clerkUserId) {
        await upsertBillingSubscription(client, {
          ...projection.subscription,
          clerkUserId,
          latestStripeEventCreatedAt: projection.stripeCreatedAt,
          latestStripeEventId: projection.stripeEventId,
        })
      }
    }

    await client.query('commit')
    return { replayed: false }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function findBillingCustomerByClerkUserId(
  queryable: Pick<PoolClient, 'query'>,
  clerkUserId: string,
) {
  const result = await queryable.query<BillingCustomerRow>(
    `
      select
        clerk_user_id as "clerkUserId",
        email,
        display_name as "displayName",
        stripe_customer_id as "stripeCustomerId"
      from billing_customers
      where clerk_user_id = $1
      limit 1
    `,
    [clerkUserId],
  )

  return result.rows[0]
}

async function findLatestBillingSubscriptionByClerkUserId(
  queryable: Pick<PoolClient, 'query'>,
  clerkUserId: string,
) {
  const result = await queryable.query<BillingSubscriptionRow>(
    `
      select
        stripe_subscription_id as "stripeSubscriptionId",
        stripe_price_id as "stripePriceId",
        status,
        to_char(current_period_end at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "currentPeriodEnd",
        latest_stripe_event_id as "latestStripeEventId"
      from billing_subscriptions
      where clerk_user_id = $1
      order by updated_at desc
      limit 1
    `,
    [clerkUserId],
  )

  return result.rows[0]
}

async function findClerkUserIdByStripeCustomerId(
  queryable: Pick<PoolClient, 'query'>,
  stripeCustomerId: string,
) {
  const result = await queryable.query<{ clerkUserId: string }>(
    `
      select clerk_user_id as "clerkUserId"
      from billing_customers
      where stripe_customer_id = $1
      limit 1
    `,
    [stripeCustomerId],
  )

  return result.rows[0]?.clerkUserId
}

async function upsertBillingSubscription(
  client: PoolClient,
  input: {
    clerkUserId: string
    currentPeriodEnd?: string
    latestStripeEventCreatedAt: string
    latestStripeEventId: string
    status: string
    stripeCustomerId: string
    stripePriceId?: string
    stripeSubscriptionId: string
  },
) {
  await client.query(
    `
      insert into billing_subscriptions (
        clerk_user_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        current_period_end,
        latest_stripe_event_id,
        latest_stripe_event_created_at
      )
      values ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8::timestamptz)
      on conflict (stripe_subscription_id) do update
      set
        clerk_user_id = excluded.clerk_user_id,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_price_id = excluded.stripe_price_id,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        latest_stripe_event_id = excluded.latest_stripe_event_id,
        latest_stripe_event_created_at = excluded.latest_stripe_event_created_at,
        updated_at = now()
    `,
    [
      input.clerkUserId,
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.stripePriceId ?? null,
      input.status,
      input.currentPeriodEnd ?? null,
      input.latestStripeEventId,
      input.latestStripeEventCreatedAt,
    ],
  )
}
