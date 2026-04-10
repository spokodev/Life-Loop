# Life-Loop

Life-Loop is a local-first media archival platform with a hosted control plane, a desktop execution agent, explicit safety states, and a conservative deletion model.

## Source of truth
Repository documentation is authoritative. Start with:
- `VERY_FIRST_PROMPT.md`
- `docs/16-decision-baseline-phase-1.md`
- `docs/17-master-codex-execution-prompt.md`
- `docs/18-product-backlog-v1.md`
- `docs/19-implementation-readiness-check.md`
- `docs/20-final-audit-and-gap-closure.md`
- `docs/22-mvp-execution-roadmap.md`
- `docs/23-local-development-runbook.md`
- `docs/adr/`
- `docs/design/`
- `docs/qa/`

If implementation conflicts with those documents, stop and update ADRs instead of silently drifting the code.

## Monorepo layout
- `apps/web`: Next.js App Router control plane
- `apps/api`: Hono control plane API with Postgres-backed schema and jobs metadata
- `apps/desktop-agent`: Go desktop agent skeleton for local data-plane execution
- `packages/shared-types`: shared lifecycle and domain types
- `packages/design-tokens`: project-owned tokens and theme variables
- `packages/ui`: reusable UI primitives and transition-state components
- `packages/config`: typed env validation, logging helpers, and Tailwind preset

## Local setup
For the full local runbook, see `docs/23-local-development-runbook.md`.

1. Copy `.env.example` values into your shell or app-specific env files as needed.
2. Start local infrastructure with `pnpm infra:up`.
3. Install dependencies with `pnpm install`.
4. Run database schema setup with `pnpm db:migrate`.
5. Start the control plane with `pnpm dev`.
6. Open [http://localhost:3000](http://localhost:3000) and verify:
   - web health: [http://localhost:3000/api/health](http://localhost:3000/api/health)
   - API live: [http://localhost:4000/health/live](http://localhost:4000/health/live)
   - API ready: [http://localhost:4000/health/ready](http://localhost:4000/health/ready)
7. Optionally run `pnpm smoke:health` while web and API are running to check those health endpoints from the command line.

Production web builds require Clerk keys. API user auth is enabled only when `CLERK_ISSUER_URL` is configured, and then `CLERK_SECRET_KEY` is required so API writes can verify Clerk sessions and load canonical owner identity. CI uses explicitly fake build-time Clerk values only to exercise the static build path without external secrets; real deployments must provide real Clerk configuration.

## Quality gates
- `pnpm docs:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm smoke:health` with web and API running
- `pnpm compose:validate`
- `pnpm check`

## Production baseline
- Single Hetzner VPS
- Docker Compose under `/opt/life-loop`
- Shared Traefik network only
- Persistent Postgres storage
- Logs to stdout/stderr
- Health checks and `restart: unless-stopped`

The template lives at `infra/docker/docker-compose.prod.template.yml`. It is intentionally limited to the control plane and does not turn the VPS into the primary archive for originals.
Use a real `.env.production` file at deploy time; `infra/docker/.env.production.example` exists only as a placeholder reference.
