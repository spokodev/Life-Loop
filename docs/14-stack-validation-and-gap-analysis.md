# 14. Stack Validation and Gap Analysis

## Current recommendation
- pnpm workspaces + Turborepo
- Next.js App Router web app
- Tailwind CSS + shadcn/ui-based open-code design system
- TypeScript API with Hono
- Go desktop agent
- PostgreSQL
- Postgres-backed internal job model for MVP
- Clerk for auth
- Stripe Checkout + Billing + Customer Portal
- S3-compatible preview / selected-online storage
- Docker Compose on Hetzner VPS

## Why this stack is still sound
- Turborepo fits workspace growth and shared packages well.
- Next.js App Router is the right choice for the control plane UI.
- Hono keeps the API lightweight and explicit.
- A project-owned design system avoids fragmented UI decisions.
- Docker Compose remains appropriate for a single-VPS environment.
- Cloud-staging-first iPhone ingest is the safest MVP path.
- MCP is mature enough to justify a structured adoption plan, but must stay tightly scoped.

## Decisions now closed
- auth provider choice = Clerk
- API framework choice = Hono
- background job engine choice for MVP = Postgres-backed
- billing model = Stripe
- iOS upload target for MVP = cloud-staging first
- iOS hosted-staging quotas / retention values = ADR-021
- observability baseline = structured logs + correlation IDs + OTel where practical
- restore baseline = mandatory restore drills

## Still not fully closed
- exact hosted preview / selected-online quotas / retention values
- exact Phase 1 production service split after infra audit
- exact timing for BYO storage rollout

## Biggest obvious mistakes avoided
- not using VPS as the only archive
- not making disks symmetric peers
- not coupling delete to upload success
- not skipping design system work
- not leaving QA/review as an afterthought

## Biggest remaining risk
Trying to implement too many channels at once before the archive-state model, health signals, and runbooks are trustworthy.
