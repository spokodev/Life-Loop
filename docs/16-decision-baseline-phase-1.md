# 16. Decision Baseline for Phase 1

This document closes the major open decision points for MVP planning.

## Closed decisions
- **Auth provider:** Clerk
- **Web framework:** Next.js App Router
- **API framework:** Hono
- **Background job engine (MVP):** Postgres-backed internal job model
- **Billing:** Stripe Checkout + Stripe Billing + Customer Portal
- **iPhone ingest (MVP):** cloud-staging first
- **Hosted iPhone staging limits/retention:** ADR-021
- **Observability baseline:** structured logs + correlation IDs + OpenTelemetry where practical
- **Restore baseline:** mandatory restore drills from MVP onward

## Not fully closed yet
- Exact hosted preview / selected-online limits and retention values
- Final production service split on the VPS after the infra audit completes
- Exact BYO-storage rollout timing

## Why this is enough to proceed
These decisions remove the biggest blockers for:
- repository bootstrap
- implementation planning
- CI setup
- domain modeling
- operational runbooks
- MVP backlog breakdown

## Delivery principle
Proceed with implementation using these decisions as the current source of truth.
Any change must be done through a new ADR, not by drifting silently in code.
