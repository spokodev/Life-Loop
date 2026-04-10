# ADR-017: Stripe Billing Webhook Policy

## Status
Accepted for MVP

## Context
ADR-009 selects Stripe Checkout, Stripe Billing, and Stripe Customer Portal. The remaining MVP gap is the concrete API and persistence policy for Stripe webhooks and billing state.

This matters because billing must stay separate from archive safety. A subscription event can update plan/status display, but it must not change archive health, storage-target health, cleanup eligibility, restore readiness, or any data-plane execution state.

## Decision
For MVP:

1. Stripe remains the source of truth for Checkout, subscriptions, invoices, and Customer Portal account management.
2. The API may create Stripe Checkout Sessions and Customer Portal sessions for authenticated Clerk users only.
3. Webhook processing must verify Stripe signatures with `STRIPE_WEBHOOK_SECRET` before parsing or persisting the event.
4. Webhook processing must be idempotent by Stripe event id.
5. Persist a minimal billing projection for display and support diagnostics:
   - Stripe customer id,
   - Clerk user id,
   - subscription id,
   - subscription status,
   - price id,
   - current period end,
   - latest verified Stripe event id and timestamp.
6. Persist verified webhook event metadata and processing outcome. Do not persist full card/payment method details.
7. Checkout-created customers must carry Clerk user id metadata so webhook events can be associated back to the Life-Loop owner identity.
8. Unknown verified event types should be recorded as ignored and return success to Stripe. Invalid or missing signatures must return a client error and must not be persisted as trusted billing state.
9. Billing status is display-only in MVP. It must not gate archive writes, health, restore readiness, cleanup eligibility, or desktop-agent work.

## Guardrails
- Do not implement custom subscription logic beyond Stripe-hosted Checkout, Billing, Customer Portal, and a read-only local projection.
- Do not couple billing state to archive-health or deletion policy.
- Do not allow device credentials to create Checkout or Portal sessions.
- Do not trust client-provided Stripe customer or subscription ids.
- Do not hardcode Stripe secrets or price ids.

## Consequences
### Positive
- Keeps billing operationally useful without building a parallel billing system.
- Provides enough local state for settings/status UI and support triage.
- Makes webhook replay safe and separates billing from archive correctness.

### Trade-offs
- The local projection can lag Stripe until a webhook arrives.
- Plan entitlement enforcement is intentionally deferred.
- Tests need signature-verification coverage and explicit no-archive-coupling assertions.

## Revisit Trigger
Revisit when:
- team or organization billing is introduced,
- plan limits must gate hosted convenience-layer capacity,
- App Store purchase handoff is implemented, or
- billing needs to drive entitlement enforcement beyond read-only display.
