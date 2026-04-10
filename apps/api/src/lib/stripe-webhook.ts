import type Stripe from 'stripe'

export type BillingWebhookProcessingStatus = 'processed' | 'ignored'

export type BillingSubscriptionProjection = {
  clerkUserId?: string
  currentPeriodEnd?: string
  stripeCustomerId: string
  stripePriceId?: string
  stripeSubscriptionId: string
  status: string
}

export type BillingEventProjection = {
  eventType: string
  livemode: boolean
  processingStatus: BillingWebhookProcessingStatus
  relatedClerkUserId?: string
  relatedCustomerId?: string
  relatedSubscriptionId?: string
  stripeCreatedAt: string
  stripeEventId: string
  subscription?: BillingSubscriptionProjection
}

export class StripeWebhookError extends Error {
  readonly status = 400
  readonly title = 'Invalid Stripe webhook'
}

export function verifyStripeWebhookEvent({
  rawBody,
  signatureHeader,
  stripe,
  webhookSecret,
}: {
  rawBody: string
  signatureHeader?: string | null | undefined
  stripe: Stripe
  webhookSecret: string
}) {
  if (!signatureHeader) {
    throw new StripeWebhookError('Stripe-Signature header is required.')
  }

  try {
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret)
  } catch {
    throw new StripeWebhookError('Stripe webhook signature verification failed.')
  }
}

export function mapStripeEventToBillingProjection(event: Stripe.Event): BillingEventProjection {
  const base = {
    eventType: event.type,
    livemode: event.livemode,
    stripeCreatedAt: new Date(event.created * 1000).toISOString(),
    stripeEventId: event.id,
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const stripeCustomerId = readStripeId(session.customer)
    const stripeSubscriptionId = readStripeId(session.subscription)
    const clerkUserId = readMetadata(session.metadata, 'clerkUserId')

    return {
      ...base,
      processingStatus: stripeCustomerId && clerkUserId ? 'processed' : 'ignored',
      ...(clerkUserId ? { relatedClerkUserId: clerkUserId } : {}),
      ...(stripeCustomerId ? { relatedCustomerId: stripeCustomerId } : {}),
      ...(stripeSubscriptionId ? { relatedSubscriptionId: stripeSubscriptionId } : {}),
    }
  }

  if (isSubscriptionEvent(event.type)) {
    const subscription = event.data.object as Stripe.Subscription
    const stripeCustomerId = readStripeId(subscription.customer)
    const stripeSubscriptionId = subscription.id
    const clerkUserId = readMetadata(subscription.metadata, 'clerkUserId')
    const stripePriceId = subscription.items.data[0]?.price.id
    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : undefined

    return {
      ...base,
      processingStatus: stripeCustomerId ? 'processed' : 'ignored',
      ...(clerkUserId ? { relatedClerkUserId: clerkUserId } : {}),
      ...(stripeCustomerId ? { relatedCustomerId: stripeCustomerId } : {}),
      relatedSubscriptionId: stripeSubscriptionId,
      ...(stripeCustomerId
        ? {
            subscription: {
              ...(clerkUserId ? { clerkUserId } : {}),
              ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
              stripeCustomerId,
              ...(stripePriceId ? { stripePriceId } : {}),
              stripeSubscriptionId,
              status: subscription.status,
            },
          }
        : {}),
    }
  }

  return {
    ...base,
    processingStatus: 'ignored',
  }
}

function isSubscriptionEvent(eventType: string) {
  return (
    eventType === 'customer.subscription.created' ||
    eventType === 'customer.subscription.updated' ||
    eventType === 'customer.subscription.deleted'
  )
}

function readStripeId(value: string | { id: string } | null) {
  if (typeof value === 'string') {
    return value
  }

  return value?.id
}

function readMetadata(metadata: Stripe.Metadata | null, key: string) {
  const value = metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
