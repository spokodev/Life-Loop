# Life-Loop Very First Prompt for Codex

You are implementing Life-Loop from this repository.

Non-negotiable rule: treat the repository documentation as the source of truth. Do not invent a parallel architecture. Do not ask unnecessary questions if the answer is already documented. If implementation reality conflicts with documentation, stop, explain the conflict, and propose an ADR update instead of silently changing direction.

## Your mission
Bootstrap the repository into a working MVP foundation that is aligned with the documented product, architecture, UX, security, QA, design-system, and VPS standards.

## Primary documents to read first
1. README.md
2. docs/16-decision-baseline-phase-1.md
3. docs/17-master-codex-execution-prompt.md
4. docs/18-product-backlog-v1.md
5. docs/19-implementation-readiness-check.md
6. docs/20-final-audit-and-gap-closure.md
7. docs/11-mcp-strategy.md
8. docs/design/01-design-system-foundation.md
9. docs/design/06-motion-system.md
10. docs/design/09-transition-states-and-feedback.md
11. docs/design/10-ui-implementation-guide.md
12. docs/12-vps-infrastructure-baseline.md
13. docs/adr/*.md

## Constraints
- Do not implement non-MVP hidden automation.
- Do not add auto-delete behavior.
- Do not bypass documented security, storage, or deletion policies.
- Do not couple control plane and data plane.
- Do not turn the VPS into the primary archive for originals.
- Do not replace the design-system direction with an unrelated UI stack.
- Do not skip state coverage for loading, empty, error, partial-success, blocked, and reduced-motion variants.
- Do not introduce Kubernetes or extra reverse proxies.
- Do not hardcode secrets.
- Do not skip validation.

## Phase 1 locked decisions
- Auth provider: Clerk
- Web: Next.js App Router
- API: Hono
- Job model for MVP: Postgres-backed internal jobs
- Billing: Stripe Checkout + Stripe Billing + Customer Portal
- iPhone MVP ingest: cloud-staging first
- Originals policy: local-first originals, hosted convenience layer only
- Monorepo: pnpm workspaces + Turborepo
- Design system: Tailwind + shadcn/ui + project-owned tokens and components
- Desktop agent: Go
- Database: PostgreSQL
- VPS model: single Hetzner VPS, Docker Compose, /opt/<project>, shared Traefik

## Exact execution order
1. Validate repository structure and docs consistency.
2. Produce a short implementation plan mapped to the backlog.
3. Bootstrap monorepo foundations:
   - pnpm workspace
   - turbo
   - root package scripts
   - TypeScript base config
   - Biome / lint / formatting
   - env example structure
4. Create starter apps/packages:
   - apps/web
   - apps/api
   - apps/desktop-agent
   - packages/shared-types
   - packages/ui
   - packages/design-tokens
   - packages/config
5. Wire design-system foundations first:
   - token package
   - base Tailwind config
   - UI package scaffolding
   - typography, color, spacing, radius, elevation, motion primitives
   - transition-state components and patterns
   - reduced-motion behavior
6. Add db schema v1 from the documented domain model.
7. Add local developer infrastructure:
   - docker-compose.dev.yml
   - Postgres service
   - optional MinIO only if needed for selected/previews in local dev
8. Add production templates aligned with the VPS baseline.
9. Add health endpoints, typed config validation, structured logging, correlation IDs, and test/lint/typecheck pipeline.
10. Add initial CI.
11. Run validation.
12. Summarize what was created, what passes, what remains, and what risks or unresolved items exist.

## Required quality gates
After each major step, self-review against:
- docs/qa/01-architecture-review-checklist.md
- docs/qa/02-code-review-checklist.md
- docs/qa/03-release-readiness-checklist.md
- docs/qa/04-ui-and-transition-checklist.md

## Required outputs in every substantial update
- Changed files
- Why the change was made
- Validation run
- Remaining risks
- Whether docs or ADRs need updates

## If you find missing implementation details
Follow this order:
1. Search the docs in this repo.
2. If the answer is implied, use the documented direction conservatively.
3. If the answer is not documented and the choice is material, stop and propose an ADR.

## Definition of success for this first run
A developer can clone the repo, install dependencies, run the workspace, start local infra, open the web app, hit health endpoints, run CI-quality checks, and understand the product and implementation direction without guesswork.
