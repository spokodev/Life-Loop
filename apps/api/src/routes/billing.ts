import { idempotencyKeyHeader, parseApiEnv } from '@life-loop/config'
import type {
  CreateBillingCheckoutSessionResponse,
  CreateBillingPortalSessionResponse,
  OwnerIdentityInput,
} from '@life-loop/shared-types'
import { type Context, Hono } from 'hono'
import Stripe from 'stripe'

import {
  findBillingCustomer,
  getBillingStatus,
  persistBillingEventProjection,
  upsertBillingCustomer,
} from '../db/billing'
import { problemJson } from '../lib/problem'
import {
  mapStripeEventToBillingProjection,
  StripeWebhookError,
  verifyStripeWebhookEvent,
} from '../lib/stripe-webhook'
import { resolveUserActor, UserAuthError } from '../lib/user-auth'

const env = parseApiEnv(process.env)

export const billingRoutes = new Hono<{
  Variables: {
    correlationId: string
  }
}>()

type BillingContext = Context<{
  Variables: {
    correlationId: string
  }
}>

type BillingConfig = {
  checkoutCancelUrl: string
  checkoutPriceId: string
  checkoutSuccessUrl: string
  portalReturnUrl: string
  secretKey: string
  webhookSecret: string
}

billingRoutes.get('/billing/status', async (context) => {
  try {
    const actor = await requireBillingActor(context)
    const billing = await getBillingStatus(actor.clerkUserId)

    return context.json({ billing })
  } catch (error) {
    return mapBillingError(context, error)
  }
})

billingRoutes.post('/billing/checkout-session', async (context) => {
  try {
    const config = requireBillingConfig()
    const actor = await requireBillingActor(context)
    const stripe = createStripeClient(config)
    const customer = await ensureBillingCustomer(actor, stripe)

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customer.stripeCustomerId,
        client_reference_id: actor.clerkUserId,
        line_items: [
          {
            price: config.checkoutPriceId,
            quantity: 1,
          },
        ],
        success_url: config.checkoutSuccessUrl,
        cancel_url: config.checkoutCancelUrl,
        metadata: {
          clerkUserId: actor.clerkUserId,
        },
        subscription_data: {
          metadata: {
            clerkUserId: actor.clerkUserId,
          },
        },
      },
      {
        idempotencyKey:
          context.req.header(idempotencyKeyHeader) ??
          `checkout:${actor.clerkUserId}:${context.get('correlationId')}`,
      },
    )

    if (!session.url) {
      throw new Error('Stripe Checkout did not return a redirect URL.')
    }

    const response: CreateBillingCheckoutSessionResponse = {
      sessionId: session.id,
      url: session.url,
    }

    return context.json(response, 201)
  } catch (error) {
    return mapBillingError(context, error)
  }
})

billingRoutes.post('/billing/customer-portal-session', async (context) => {
  try {
    const config = requireBillingConfig()
    const actor = await requireBillingActor(context)
    const stripe = createStripeClient(config)
    const customer = await ensureBillingCustomer(actor, stripe)
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: config.portalReturnUrl,
    })

    const response: CreateBillingPortalSessionResponse = {
      url: session.url,
    }

    return context.json(response, 201)
  } catch (error) {
    return mapBillingError(context, error)
  }
})

billingRoutes.post('/billing/webhooks/stripe', async (context) => {
  try {
    const config = requireBillingConfig()
    const stripe = createStripeClient(config)
    const rawBody = await context.req.text()
    const event = verifyStripeWebhookEvent({
      rawBody,
      signatureHeader: context.req.header('stripe-signature'),
      stripe,
      webhookSecret: config.webhookSecret,
    })
    const projection = mapStripeEventToBillingProjection(event)
    const persistence = await persistBillingEventProjection(projection)

    return context.json({
      received: true,
      replayed: persistence.replayed,
      processingStatus: projection.processingStatus,
    })
  } catch (error) {
    return mapBillingError(context, error)
  }
})

async function requireBillingActor(context: BillingContext): Promise<
  OwnerIdentityInput & {
    clerkUserId: string
  }
> {
  const actor = await resolveUserActor({
    authorizationHeader: context.req.header('authorization'),
    env,
  })

  if (!actor?.clerkUserId) {
    throw new UserAuthError({
      title: 'Clerk billing identity required',
      status: 403,
      detail: 'Billing actions require an authenticated Clerk user session.',
    })
  }

  return {
    ...actor,
    clerkUserId: actor.clerkUserId,
  }
}

async function ensureBillingCustomer(
  actor: OwnerIdentityInput & { clerkUserId: string },
  stripe: Stripe,
) {
  const existingCustomer = await findBillingCustomer(actor.clerkUserId)

  if (existingCustomer) {
    return upsertBillingCustomer({
      actor,
      stripeCustomerId: existingCustomer.stripeCustomerId,
    })
  }

  const stripeCustomer = await stripe.customers.create(
    {
      email: actor.email,
      ...(actor.displayName ? { name: actor.displayName } : {}),
      metadata: {
        clerkUserId: actor.clerkUserId,
      },
    },
    {
      idempotencyKey: `customer:${actor.clerkUserId}`,
    },
  )

  return upsertBillingCustomer({
    actor,
    stripeCustomerId: stripeCustomer.id,
  })
}

function createStripeClient(config: BillingConfig) {
  return new Stripe(config.secretKey)
}

function requireBillingConfig(): BillingConfig {
  if (
    !env.STRIPE_SECRET_KEY ||
    !env.STRIPE_WEBHOOK_SECRET ||
    !env.STRIPE_CHECKOUT_PRICE_ID ||
    !env.STRIPE_CHECKOUT_SUCCESS_URL ||
    !env.STRIPE_CHECKOUT_CANCEL_URL ||
    !env.STRIPE_PORTAL_RETURN_URL
  ) {
    throw new Error('Stripe billing configuration is incomplete.')
  }

  return {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    checkoutPriceId: env.STRIPE_CHECKOUT_PRICE_ID,
    checkoutSuccessUrl: env.STRIPE_CHECKOUT_SUCCESS_URL,
    checkoutCancelUrl: env.STRIPE_CHECKOUT_CANCEL_URL,
    portalReturnUrl: env.STRIPE_PORTAL_RETURN_URL,
  }
}

function mapBillingError(context: BillingContext, error: unknown) {
  if (error instanceof UserAuthError || error instanceof StripeWebhookError) {
    return problemJson(context, {
      title: error.title,
      status: error.status,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  if (error instanceof Error && error.message.includes('Stripe billing configuration')) {
    return problemJson(context, {
      title: 'Billing not configured',
      status: 503,
      detail: error.message,
      correlationId: context.get('correlationId'),
    })
  }

  throw error
}
