# 17. Master Codex Execution Prompt

Use the following prompt as the **single execution prompt** for Codex after placing this documentation into the repository.

---

You are implementing **Life-Loop**, a local-first media archival platform with hosted control plane, desktop agent, iPhone ingest, and future BYO storage support.

## Mission
Deliver a production-ready MVP codebase and infrastructure setup that follows the repository documentation as the architectural source of truth.

## Architectural source of truth
Read and follow all relevant documents in `docs/`, especially:
- `01-product-vision.md`
- `03-domain-model.md`
- `05-storage-targets-and-placement-model.md`
- `06-control-plane-architecture.md`
- `07-local-agent-architecture.md`
- `08-ios-app-architecture.md`
- `09-security-model.md`
- `10-qa-and-review-strategy.md`
- `11-mcp-strategy.md`
- `12-vps-infrastructure-baseline.md`
- `13-mvp-roadmap.md`
- `16-decision-baseline-phase-1.md`
- all ADR files under `docs/adr/`
- all design docs under `docs/design/`
- all QA checklists under `docs/qa/`

## Non-negotiable decisions
- Auth provider: Clerk
- Web app: Next.js App Router
- API: Hono
- Job engine for MVP: Postgres-backed internal job model
- Billing: Stripe Checkout + Stripe Billing + Customer Portal
- iPhone MVP ingest: cloud-staging first
- Production hosting target: Hetzner VPS with Docker Compose in `/opt/life-loop`
- Shared HTTP ingress: shared Traefik only
- Persistent data must survive container recreation
- Logs to stdout/stderr
- Healthchecks required
- Restart policy required
- Do not use `/home/deploy` for permanent production deployment

## Critical architectural rules
1. Preserve separation between **control plane** and **data plane**.
2. Preserve separation between **archive**, **replica**, **preview**, and **selected-online** roles.
3. Do not couple delete behavior to upload success.
4. Do not treat "uploaded" as "safe".
5. Model assets using the documented domain language: asset, blob, version, placement, storage target, device, library.
6. Keep originals local-first by design.
7. Prefer boring, maintainable solutions over clever ones.
8. Treat docs as the source of truth; if code conflicts with docs, fix the code unless a new ADR is created.

## Scope to implement
Create a monorepo with:
- `apps/web`
- `apps/api`
- `apps/desktop-agent`
- `packages/shared-types`
- `packages/ui`
- `packages/design-tokens`
- `packages/config`

## Required implementation outputs
1. Repo bootstrap
2. Working package manager / workspace configuration
3. Base TypeScript configuration
4. Shared design tokens
5. Basic UI system aligned with docs/design, including motion, reduced-motion, and transition-state patterns
6. Control plane web shell
7. API shell with health route, typed config, logging, and job primitives
8. DB schema v1 based on the domain model
9. Desktop agent skeleton with explicit future extension points
10. CI pipeline with lint, typecheck, tests, docs presence checks
11. Local development Docker Compose
12. Production Docker Compose template aligned with the VPS baseline
13. README/runbook files
14. Initial backlog file
15. Explicit TODO markers for non-MVP deferred items

## Quality gates
Before calling work complete:
- all workspace installs succeed
- lint passes
- typecheck passes
- tests pass
- docker compose config validates
- health endpoints exist where required
- docs links are not broken
- README/runbook instructions are coherent
- no secrets are hardcoded
- no production deployment path points to `/home/deploy`
- no code contradicts accepted ADRs

## Review discipline
After each major step:
- perform self-review against `docs/qa/`
- identify risks and edge cases
- add or adjust tests
- update backlog
- do not ask unnecessary questions if a decision is already documented

## Safety / correctness rules
- Fail fast on missing required env vars.
- Use least-privilege defaults where practical.
- Do not invent hidden automations.
- Do not auto-delete anything from phones or archives in MVP.
- Do not overengineer infrastructure beyond the single-VPS Compose target.

## Delivery behavior
Work iteratively but produce a cohesive, ready-to-run codebase.
When in doubt, prefer explicitness, debuggability, and operational clarity.

---

## Expected first implementation order
1. workspace/bootstrap
2. shared config/types/tokens
3. web shell
4. API shell
5. DB schema v1
6. CI + local Docker
7. desktop agent skeleton
8. backlog + runbooks + final review
