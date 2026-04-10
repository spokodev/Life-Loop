import assert from 'node:assert/strict'
import test from 'node:test'

import Stripe from 'stripe'

import {
  mapStripeEventToBillingProjection,
  StripeWebhookError,
  verifyStripeWebhookEvent,
} from './stripe-webhook'

const webhookSecret = 'whsec_test_secret'
const stripe = new Stripe('sk_test_example')

test('verifyStripeWebhookEvent rejects a missing signature', () => {
  assert.throws(
    () =>
      verifyStripeWebhookEvent({
        rawBody: '{}',
        stripe,
        webhookSecret,
      }),
    (error) => error instanceof StripeWebhookError && error.status === 400,
  )
})

test('verifyStripeWebhookEvent rejects an invalid signature', () => {
  assert.throws(
    () =>
      verifyStripeWebhookEvent({
        rawBody: '{}',
        signatureHeader: 'invalid',
        stripe,
        webhookSecret,
      }),
    (error) => error instanceof StripeWebhookError && error.status === 400,
  )
})

test('verifyStripeWebhookEvent accepts a valid Stripe test signature', () => {
  const event = {
    id: 'evt_checkout_completed',
    object: 'event',
    type: 'checkout.session.completed',
    livemode: false,
    created: 1_700_000_000,
    data: {
      object: {
        id: 'cs_test_123',
        object: 'checkout.session',
        customer: 'cus_123',
        subscription: 'sub_123',
        metadata: {
          clerkUserId: 'user_123',
        },
      },
    },
  }
  const rawBody = JSON.stringify(event)
  const signatureHeader = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: webhookSecret,
  })

  const verifiedEvent = verifyStripeWebhookEvent({
    rawBody,
    signatureHeader,
    stripe,
    webhookSecret,
  })

  assert.equal(verifiedEvent.id, 'evt_checkout_completed')
})

test('mapStripeEventToBillingProjection maps subscription updates without archive coupling', () => {
  const event = {
    id: 'evt_subscription_updated',
    object: 'event',
    type: 'customer.subscription.updated',
    livemode: false,
    created: 1_700_000_000,
    data: {
      object: {
        id: 'sub_123',
        object: 'subscription',
        customer: 'cus_123',
        status: 'active',
        current_period_end: 1_700_086_400,
        metadata: {
          clerkUserId: 'user_123',
        },
        items: {
          data: [
            {
              price: {
                id: 'price_123',
              },
            },
          ],
        },
      },
    },
  } as unknown as Stripe.Event

  const projection = mapStripeEventToBillingProjection(event)

  assert.equal(projection.processingStatus, 'processed')
  assert.equal(projection.subscription?.clerkUserId, 'user_123')
  assert.equal(projection.subscription?.stripeCustomerId, 'cus_123')
  assert.equal(projection.subscription?.stripeSubscriptionId, 'sub_123')
  assert.equal(projection.subscription?.stripePriceId, 'price_123')
  assert.equal(projection.subscription?.status, 'active')
  assert.equal(JSON.stringify(projection).includes('archive'), false)
  assert.equal(JSON.stringify(projection).includes('cleanup'), false)
  assert.equal(JSON.stringify(projection).includes('restore'), false)
})

test('mapStripeEventToBillingProjection records unknown verified event types as ignored', () => {
  const event = {
    id: 'evt_unknown',
    object: 'event',
    type: 'invoice.payment_succeeded',
    livemode: false,
    created: 1_700_000_000,
    data: {
      object: {
        id: 'in_123',
        object: 'invoice',
      },
    },
  } as unknown as Stripe.Event

  const projection = mapStripeEventToBillingProjection(event)

  assert.equal(projection.processingStatus, 'ignored')
  assert.equal(projection.relatedCustomerId, undefined)
})
