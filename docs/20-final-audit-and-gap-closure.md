# Final Audit and Gap Closure

This document converts the remaining open questions into a launch-ready baseline. It is intentionally strict: if implementation conflicts with this document, the conflict must be surfaced and handled via ADR rather than silently worked around.

## Overall audit verdict

The current repository pack is strong enough to begin controlled implementation. The architecture is coherent, the separation between control plane and data plane is correct, the deletion model is conservative, the VPS deployment model matches the existing operational environment, and the design-system direction is explicit.

This pack should be treated as **implementation-ready for Phase 1 bootstrap**, not as a claim that every future production variable is already finalized.

## What is covered well

### Product and system boundaries
- Control plane vs data plane is explicit.
- Local-first originals policy is explicit.
- Hosted layer is limited to manifests, previews, selected assets, and convenience functions.
- Multi-user growth has been anticipated through users, libraries, devices, storage targets, and placements.

### Storage and data lifecycle
- Logical `asset / blob / version / placement` modeling is present.
- Replica semantics are favored over peer-to-peer disk sync.
- Delete-after-verify posture is correct.
- Restore drills are required rather than treated as optional.

### UX and design-system direction
- A project-owned design system is chosen.
- Navigation and information architecture are documented.
- UX risk review exists.
- AI is treated as an additive future surface, not a replacement for core product clarity.

### UI implementation and transition-state coverage
- Motion system is documented.
- Reduced-motion expectations are documented.
- Transition-state behavior for positive, negative, partial-success, and dependency-loss flows is documented.
- UI implementation rules now exist at the screen, pattern, and checklist level.

### Delivery and operations
- Single-VPS deployment model matches the actual infrastructure.
- Docker Compose and shared Traefik fit the server baseline.
- Healthchecks, restart policy, logging, and operational README expectations are present.

### Engineering quality
- QA and review checklists exist.
- ADR discipline exists.
- MCP strategy exists.
- Backlog and readiness docs exist.

## What was missing and is now explicitly closed for Phase 1

### 1. Authentication provider
**Decision:** Clerk.

Rationale:
- Multi-tenant Organizations support matches the planned product shape.
- Faster and safer than building identity in-house for MVP.
- Keeps auth, session, org context, and role handling out of the critical-path custom build.

### 2. API framework
**Decision:** Hono for the API service, Next.js App Router for the web control plane.

Rationale:
- Keeps the web app optimized for dashboard/product UI.
- Keeps the API layer small, typed, and runtime-flexible.
- Avoids stuffing all platform concerns into one framework surface.

### 3. Background jobs
**Decision:** Postgres-backed internal job model for MVP.

Rationale:
- Enough durability for the first implementation.
- Lower operational cost than introducing a dedicated workflow platform too early.
- Durable-workflow tooling can remain a future ADR.

### 4. Billing model
**Decision:** Stripe Checkout + Stripe Billing + Customer Portal.

Rationale:
- Hosted checkout reduces risk.
- Hosted customer portal reduces account-management surface area.
- Sufficient for subscriptions, plan changes, invoices, and payment methods.

### 5. iPhone ingest flow
**Decision:** cloud-staging first for MVP; local-network/direct-to-agent later.

Rationale:
- Better fit for a reliable MVP.
- Better alignment with background uploads.
- Local network flows remain valuable, but should not be the first dependency.

### 6. Observability baseline
**Decision:** structured logs, correlation IDs, health endpoints, OpenTelemetry where practical.

Rationale:
- Gives enough traceability without overbuilding.
- Supports future integration with the existing monitoring stack.

### 7. Restore drills
**Decision:** mandatory restore drills are part of the definition of done.

Rationale:
- Backup claims without restore testing are insufficient.
- Recovery needs explicit validation.

## Remaining items that are intentionally not hard-locked yet

These are not blockers for bootstrap, but they must not be forgotten:

1. Exact hosted-storage quotas and retention numbers.
2. Final production service split after the VPS audit is complete.
3. When BYO-storage becomes part of the roadmap beyond placeholders.
4. Whether MinIO is needed in local dev immediately or can wait until previews/selected-online are active.
5. Exact plan packaging and pricing details.

## Coverage review by discipline

### Architecture
Status: **strong**

Covered:
- boundaries
- domain entities
- platform roles
- control/data separation
- deletion posture
- future storage extensibility

Still watch:
- avoid letting convenience flows leak into archive truth
- avoid accidental re-coupling between API and agent responsibilities

### UX / design
Status: **good enough for implementation start, not final product design**

Covered:
- design-system direction
- token strategy
- navigation and IA
- AI-ready surface
- UX risks

Still watch:
- very large dataset table ergonomics once real data exists
- billing/plan-change clarity
- organization switching clarity once multi-tenant UI exists
- visual QA on implemented screens, not only documented patterns

### API and backend
Status: **good for MVP**

Covered:
- API framework choice
- DB choice
- domain model direction
- background job posture

Still watch:
- exact API conventions and versioning policy
- webhook signature handling
- idempotency keys on critical write paths
- stronger event model once jobs proliferate

### Database
Status: **good for MVP**

Covered:
- PostgreSQL as source of control-plane truth
- restore-drill direction
- PITR awareness

Still watch:
- migration discipline
- tenant scoping and row-level authorization model
- retry-safe uniqueness constraints
- blob/placement write-path invariants

### Mobile
Status: **good enough to start**

Covered:
- PhotosPicker direction
- cloud-staging-first decision
- local network reserved for later

Still watch:
- background upload edge cases
- permission downgrade flows
- what exactly is cached locally in the app
- retry semantics when the app is force-quit

### Desktop agent
Status: **good enough to start**

Covered:
- Go direction
- disk-centric execution model
- agent owns local archive mechanics

Still watch:
- mount detection behavior
- safe resume semantics
- partial-copy quarantine strategy
- OS-specific packaging later

### Security
Status: **good baseline**

Covered:
- secrets handling posture
- least-privilege container direction
- no secret logging
- local-first originals
- delete conservatism
- device-scoped credential redeem / heartbeat / revoke / rotate path per ADR-014

Still watch:
- webhook verification details
- storage credential rotation flows
- per-environment MCP permissions

### DevEx / repo / CI
Status: **good enough to start**

Covered:
- monorepo direction
- workspace tooling direction
- CI placeholder
- docs as source of truth

Still watch:
- dependency pinning policy
- release process
- branch naming / commit conventions if desired
- preview deployment workflow if needed later

## Best-practice alignment scorecard

- Simple VPS topology instead of premature orchestration: **yes**
- Shared reverse proxy instead of app-specific proxies: **yes**
- Persistent data outside containers: **yes**
- Healthcheck-aware service startup: **yes**
- Restart policy: **yes**
- Local-first originals: **yes**
- Hosted convenience layer only: **yes**
- Design system before feature sprawl: **yes**
- Review and QA checklists before feature sprint: **yes**
- Restore testing treated as required: **yes**
- Multi-tenant growth considered early: **yes**
- MCP permissions constrained by environment: **yes**

## What must not be changed casually during implementation

1. Originals must not drift into VPS-managed primary archive storage.
2. Delete must not become automatic in MVP.
3. Disk replicas must not be reframed as peer-sync nodes.
4. The design system must not be replaced with ad-hoc styling.
5. Background jobs must not become implicit hidden automation with unclear state.
6. The agent must not become a thin shell over the API; it owns local archive execution.
7. The web app must not become the only API surface for mobile and agent logic.

## Readiness statement

**Yes:** the project is ready for controlled bootstrap implementation.

That does not mean every future production decision is complete. It means the repository pack is now strong enough that Codex can start implementation without having to invent the product or architecture from scratch.


### Motion and transitional-state design
Status: **now explicitly covered**

Covered:
- motion system direction
- reduced-motion requirement
- screen-level rules
- transition-state model
- positive, negative, and edge-state feedback requirements

Still watch:
- actual implementation quality in dense dashboard surfaces
- animation performance on lower-powered devices
- ensuring success states never over-promise safety

## Final design and UX closure for bootstrap

For bootstrap readiness, the design layer is now considered sufficiently covered because it includes:
- design-system foundation
- tokens
- navigation and IA
- motion rules
- brand/tone rules
- transition-state rules
- UI implementation guidance
- user-state matrix
- UI QA checklist

This does not mean the shipped product design is final. It means the implementation baseline is strong enough that Codex should not have to guess how to treat trust-critical states.
