# 25. MVP Audit Status

This audit records the current implementation state after the Phase 1 foundation, job execution, desktop verification, hosted-staging archive handoff, restore evidence, cleanup readiness, iPhone staging foundation, and production hardening slices.

## Verdict
The repository is a strong MVP foundation, but it is not yet an end-to-end complete product.

A developer can clone the repo, install dependencies, start local infrastructure, run migrations, start web/API/agent foundations, validate health endpoints, run CI-quality checks, and run an explicit DB-backed hosted-staging archive handoff smoke. The full acceptance flow is still incomplete because automated restore execution, manual cleanup-review execution, full iOS app packaging, production image build/publish, and live VPS health validation remain open.

## Completed
- Monorepo foundation with pnpm workspaces, Turborepo, TypeScript, Biome, CI, docs checks, compose validation, and production baseline validation.
- Next.js App Router web shell with Clerk-aware route protection, dashboard/status/activity/settings/library/devices/storage/restore/cleanup surfaces.
- Hono API with typed env validation, structured logging, correlation IDs, health endpoints, Postgres migrations, domain schema, audit events, and conservative lifecycle states.
- Clerk user auth and tenant scoping per ADR-016, preserving local bootstrap mode.
- Stripe Checkout, Customer Portal, webhook signature verification, and billing projection per ADR-017, with no archive/restore/cleanup coupling.
- Postgres-backed job claim/lease/heartbeat/complete API per ADR-018, without hidden workers.
- Desktop agent heartbeat, storage-target binding coverage, device credential handling, job claim polling, placement-verification executor, and hosted-staging archive placement executor per ADR-019/ADR-022.
- Lease-authorized hosted-staging archive fetch API that streams bytes without exposing raw storage paths and only moves staging objects to `archiving`, not verified or cleanup-eligible.
- DB-backed hosted-staging archive handoff smoke via `pnpm test:db:api`, covering reservation/upload, desktop claim scoping, invalid lease rejection, staged-byte fetch, verified placement ingest reporting, and expired object rejection.
- Restore drill evidence model/API/web surface per ADR-020, clearly separated from metadata-only restore readiness; verified evidence is gated on a matching healthy verified original placement.
- Read-only manual cleanup readiness API/web surface that requires verified primary, verified replica, and asset-level restore-drill evidence.
- iPhone hosted-staging API/storage abstraction and SwiftPM SwiftUI foundation per ADR-021, without treating upload as archive safety.
- Production VPS baseline under `/opt/life-loop` with Compose template, env example, healthchecks, backup/restore notes, and rollback runbook.

## Not Complete
- `archive-placement` byte movement is implemented for `hosted-staging` jobs with a valid ADR-019 execution manifest and ADR-022 lease-authorized fetch; `agent-local-staging` remains safely blocked until a local source manifest exists.
- Restore drill execution is not automated. The API can schedule drills and record placement-backed evidence, but there is no data-plane restore executor.
- Cleanup remains read-only/manual-review readiness. There is no cleanup-review job execution UI and no delete behavior, by design.
- iOS is a SwiftPM foundation with PhotosPicker/status/upload request construction, not a signed app target with full background upload lifecycle integration.
- Desktop-agent restore-drill execution remains blocked on documented sample manifest and restore destination semantics; API evidence recording is covered, but agent restore reporting is not implemented.
- Production image build/publish workflow is not implemented. The Compose template expects externally built API/web images.
- Live VPS health checks and rollback drills have not been run against deployed services.

## QA Checklist Review
- Architecture: control plane/data plane boundaries are preserved; VPS is not used as archive-primary; cleanup/delete stays separate.
- Code: checksum verification exists for placement verification and hosted-staging archive placement; safe error classes are used on executor, staging upload, and hosted-staging fetch paths; no secrets are hardcoded.
- Release readiness: docs, ADR links, schema migrations, backup/restore notes, and rollback guidance exist; live production checks remain pending.
- UI and transition states: web surfaces include conservative empty/loading/error/blocked language; full manual visual review on deployed screens remains pending.
- Reduced motion: design-system rules and web patterns exist; iOS foundation has minimal motion and still needs app-level accessibility QA.

## Next Execution Order
1. Add an ADR update for desktop restore-drill sample manifests and restore destination semantics before implementing agent restore reporting.
2. Implement manual cleanup-review workflow states without delete automation.
3. Add production image build/publish templates and validate them in CI or a documented local build path.
4. Run a final acceptance pass: local infra, migrations, web/API/agent, device enrollment, storage binding, staging ingest, archive/verify, restore drill, cleanup readiness, and CI-quality checks.
