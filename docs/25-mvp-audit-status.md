# 25. MVP Audit Status

This audit records the current implementation state after the Phase 1 foundation, job execution, desktop verification, restore evidence, cleanup readiness, iPhone staging foundation, and production hardening slices.

## Verdict
The repository is a strong MVP foundation, but it is not yet an end-to-end complete product.

A developer can clone the repo, install dependencies, start local infrastructure, run migrations, start web/API/agent foundations, validate health endpoints, and run CI-quality checks. The full acceptance flow is still incomplete because archive placement from a supported source, automated restore execution, manual cleanup-review execution, full iOS app packaging, production image build/publish, and live VPS health validation remain open.

## Completed
- Monorepo foundation with pnpm workspaces, Turborepo, TypeScript, Biome, CI, docs checks, compose validation, and production baseline validation.
- Next.js App Router web shell with Clerk-aware route protection, dashboard/status/activity/settings/library/devices/storage/restore/cleanup surfaces.
- Hono API with typed env validation, structured logging, correlation IDs, health endpoints, Postgres migrations, domain schema, audit events, and conservative lifecycle states.
- Clerk user auth and tenant scoping per ADR-016, preserving local bootstrap mode.
- Stripe Checkout, Customer Portal, webhook signature verification, and billing projection per ADR-017, with no archive/restore/cleanup coupling.
- Postgres-backed job claim/lease/heartbeat/complete API per ADR-018, without hidden workers.
- Desktop agent heartbeat, storage-target binding coverage, device credential handling, job claim polling, and placement-verification executor.
- Restore drill evidence model/API/web surface per ADR-020, clearly separated from metadata-only restore readiness.
- Read-only manual cleanup readiness API/web surface that requires verified primary, verified replica, and asset-level restore-drill evidence.
- iPhone hosted-staging API/storage abstraction and SwiftPM SwiftUI foundation per ADR-021, without treating upload as archive safety.
- Production VPS baseline under `/opt/life-loop` with Compose template, env example, healthchecks, backup/restore notes, and rollback runbook.

## Not Complete
- `archive-placement` byte movement is still blocked unless a job contains a supported source reference and the desktop agent can resolve it. ADR-019 allows `hosted-staging` and `agent-local-staging`; implementation currently blocks both source kinds safely.
- Hosted-staging fetch/claim execution is not implemented. The API can reserve/upload/list staging objects, but the desktop agent cannot yet fetch staged bytes into archive placement.
- Restore drill execution is not automated. The API can schedule drills and record evidence, but there is no data-plane restore executor.
- Cleanup remains read-only/manual-review readiness. There is no cleanup-review job execution UI and no delete behavior, by design.
- iOS is a SwiftPM foundation with PhotosPicker/status/upload request construction, not a signed app target with full background upload lifecycle integration.
- DB-backed integration tests for concurrent job claims/device scoping are still missing; current coverage is unit-heavy.
- Production image build/publish workflow is not implemented. The Compose template expects externally built API/web images.
- Live VPS health checks and rollback drills have not been run against deployed services.

## QA Checklist Review
- Architecture: control plane/data plane boundaries are preserved; VPS is not used as archive-primary; cleanup/delete stays separate.
- Code: checksum verification exists for placement verification and hosted staging; safe error classes are used on executor and staging upload paths; no secrets are hardcoded.
- Release readiness: docs, ADR links, schema migrations, backup/restore notes, and rollback guidance exist; live production checks remain pending.
- UI and transition states: web surfaces include conservative empty/loading/error/blocked language; full manual visual review on deployed screens remains pending.
- Reduced motion: design-system rules and web patterns exist; iOS foundation has minimal motion and still needs app-level accessibility QA.

## Next Execution Order
1. Implement hosted-staging source execution for `archive-placement` under ADR-019 and ADR-021, without exposing raw paths and without hidden retention automation.
2. Add API/device route support for safe staged-object fetch or transfer manifests scoped to the authenticated device/library.
3. Extend desktop agent executor tests for hosted-staging success, checksum mismatch, missing staging object, expired staging object, and retry-safe rerun.
4. Implement restore-drill executor semantics after archive placement can produce verified archive evidence.
5. Implement manual cleanup-review workflow states without delete automation.
6. Add production image build/publish templates and validate them in CI or a documented local build path.
7. Run a final acceptance pass: local infra, migrations, web/API/agent, device enrollment, storage binding, staging ingest, archive/verify, restore drill, cleanup readiness, and CI-quality checks.
