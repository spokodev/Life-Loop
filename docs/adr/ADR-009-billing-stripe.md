# ADR-009: Billing = Stripe Checkout + Billing + Customer Portal

## Status
Accepted

## Context
Life-Loop needs hosted subscriptions, plan changes, payment method management, and a low-friction implementation path.

## Decision
Use **Stripe Checkout** for sign-up conversion, **Stripe Billing** for subscriptions, and **Stripe Customer Portal** for self-service subscription management.

## Why
- Fast path to production.
- Mature subscription lifecycle support.
- Reduces custom billing UI complexity.
- Good fit for web-first billing flows and future iOS handoff flows.

## Consequences
### Positive
- Lower custom implementation burden.
- Strong operational baseline for hosted plans.
- Good future extensibility.

### Trade-offs
- External dependency.
- Billing UX partly lives in Stripe-hosted surfaces.

## Notes
Do not implement custom billing logic before MVP traction proves the need.
