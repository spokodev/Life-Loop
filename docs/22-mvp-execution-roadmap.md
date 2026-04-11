# 22. MVP Execution Roadmap

This roadmap is the working implementation checklist for completing Life-Loop from the current MVP foundation to an end-to-end product. It is subordinate to the accepted ADRs and the rest of `docs/`; if this file conflicts with an accepted decision, the ADR wins and this file must be corrected.

## Operating Rules
- Continue on `main` unless the repository workflow changes.
- Work in narrow, validated commits and push after each successful slice.
- Do not pause after a successful commit/push; continue to the next unblocked item.
- Stop only for documented conflicts, missing material architecture decisions, destructive-action risk, or validation failures that cannot be resolved without changing direction.
- Before implementing material job execution, iOS staging retention, Clerk authorization scoping, or Stripe webhook policy, confirm the decision is documented or add an ADR first.
- After every major slice, self-review against `docs/qa/`.

## Guardrails
- No auto-delete behavior in MVP.
- No hidden automation or ambiguous background state.
- No hardcoded secrets.
- No Kubernetes or extra reverse proxies.
- Do not turn the VPS into the primary archive for originals.
- Do not upload raw local filesystem paths to the control plane.
- Keep control-plane metadata distinct from data-plane archive execution.
- Preserve loading, empty, error, partial-success, blocked, and reduced-motion state coverage for user-facing work.

## Execution Backlog

### 1. Foundation Hardening
- Tighten CI to use the lockfile strictly. **Done:** CI now uses `pnpm install --frozen-lockfile`.
- Add build coverage where practical without making external secrets mandatory. **Done:** CI runs `pnpm build` with explicit fake Clerk build-time values only.
- Keep generated/cache artifacts untracked and ignored.
- Improve README/runbooks so a fresh developer can install dependencies, start local infra, migrate the database, run web/API/agent, and validate health endpoints. **Done:** `docs/23-local-development-runbook.md` covers the local flow.
- Add smoke-test scripts only when they run locally without external secrets. **Done:** `pnpm smoke:health` checks web/API health endpoints when services are running.

### 2. Auth and Tenant Safety
- Add an ADR for Clerk user auth and tenant scoping before route enforcement. **Done:** ADR-016 defines user auth, bootstrap mode, and device-auth separation.
- Finish Clerk integration for web route protection and authenticated owner context. **Done:** configured Clerk middleware when keys are present and onboarding now sends authenticated Clerk session tokens instead of manual Clerk user ids.
- Enforce Clerk identity on user-owned API write paths when auth is enabled. **Done:** API write routes derive `owner/requestedBy` from verified Clerk sessions and assert library ownership before device, storage-target, device-admin, and job mutations.
- Preserve documented bootstrap mode for local development. **Done:** API auth remains disabled unless `CLERK_ISSUER_URL` is set; bootstrap mode still accepts explicit owner/requestedBy fields.
- Test auth-disabled bootstrap behavior, auth-enabled missing Clerk identity, and device credential scoping. **Done:** `user-auth` unit coverage exercises bootstrap, missing Clerk bearer token, derived Clerk actor, issuer mismatch, and device credential rejection.

### 3. Billing
- Add an ADR for Stripe webhook and billing-projection policy before route implementation. **Done:** ADR-017 defines signature verification, idempotent event persistence, minimal billing projection, and no archive-health coupling.
- Add Stripe config validation for Checkout, Billing, Customer Portal, and webhook signature verification. **Done:** API env validates complete Stripe config when billing is enabled.
- Keep billing UI Stripe-hosted and explicit. **Done:** Settings links to API-created Stripe Checkout and Customer Portal sessions only.
- Do not implement custom subscription logic beyond plan/status display and safe webhook persistence. **Done:** local state is a minimal display projection from verified Stripe events.
- Test missing signature, invalid signature, known subscription events, and separation from archive health. **Done:** webhook unit coverage verifies signature failure paths, subscription projection, ignored events, and no archive/cleanup/restore coupling in billing projection.

### 4. Job Execution Architecture
- Add an ADR for the concrete Postgres-backed job claim, lease, and heartbeat protocol before coding an executor. **Done:** ADR-018 defines explicit claim, lease token, heartbeat, timeout recovery, retry, blocked, and terminal-state rules.
- Implement explicit claim, lease timeout, transition, retry, blocked, and terminal-state APIs without hidden automation. **Done:** API exposes device-authenticated claim, heartbeat, and complete/block/fail endpoints; expired leases are recovered only inside explicit claim calls.
- Scope agent job claims to authenticated device/library. **Done:** claim mutations require a device credential and lease token; claims are limited to the credential library and device-targeted jobs.
- Keep job state observable through jobs and activity surfaces. **Done:** jobs now expose claim timestamps and activity explains claim, heartbeat, expired-lease recovery, and claim-completion events.
- Test duplicate claims, terminal jobs, retry transitions, and blocked reasons. **Partial:** unit coverage verifies lease token hashing and transition reason rules; DB-backed concurrency and device-scope integration coverage still needs to be added with the executor slice.

### 5. Desktop Archive Executor
- Add a material execution-manifest ADR before implementing byte-moving executor behavior. **Done:** ADR-019 defines safe claim execution manifests, relative path constraints, agent-local source resolution, and blocked behavior for missing/unsupported manifests.
- Implement agent polling/claim loop only after the job protocol ADR is accepted. **Done:** the Go agent polls one bounded job claim after heartbeat and completes claims through the lease API.
- Execute archive-placement and placement-verification through the provider abstraction and local binding map. **Partial:** placement-verification executes via local binding + checksum verification; archive-placement blocks safely until a supported ADR-019 source resolver exists.
- Use temp writes, checksum verification, atomic rename, durable state transitions, and quarantine/blocking behavior for partial-copy failures. **Partial:** checksum verification and blocked completion paths are wired; temp-write/atomic placement is available in the provider but not invoked for archive placement until source resolution is implemented.
- Report only target ids, placement outcomes, checksums, health state, and safe error classes. **Done:** completion reports use status, safe reason, and safe error class only.
- Test missing binding, provider mismatch, checksum mismatch, disk unavailable, retry-safe rerun, and unsupported future provider. **Done:** desktop executor unit tests cover these blocked/success paths for the implemented verification executor.

### 6. Restore Execution
- Add explicit restore job semantics distinct from restore-readiness views. **Done:** ADR-020 defines restore-drill evidence as separate from metadata-only readiness and blocks false pass claims until explicit evidence exists.
- Implement restore-drill execution for small samples. **Partial:** API records per-asset evidence and rolls up pass/fail only from explicit evidence; automated data-plane restore execution remains blocked until a restore executor exists.
- Record drill state and surface pass/fail history in API and web. **Done:** restore evidence has a DB table, device-scoped recording endpoint, drill detail endpoint, and restore page evidence summary.
- Do not claim restore safety without verified placement and drill evidence.
- Test ready, degraded, blocked, partial-success, and failed restore evidence paths.

### 7. Cleanup Policy
- Implement manual cleanup-review jobs and UI states only.
- Keep delete disabled/manual for MVP.
- Prove upload success alone never creates cleanup eligibility.
- Keep cleanup blocked without verified primary, verified replica, and restore posture.

### 8. iPhone Ingest MVP
- Add `apps/ios` SwiftUI foundation with PhotosPicker and background URLSession upload.
- Add hosted cloud-staging API/storage abstraction only after retention/quota details are documented.
- Show mobile asset state as uploaded, staged, archiving, verified, or blocked without equating upload with archive safety.
- Add simulator-build or Swift tests where local tooling supports them; otherwise document the exact Xcode validation command and blocker.

### 9. Production Hardening
- Finalize Docker production templates, env examples, healthchecks, migrations, Traefik labels, backup/restore notes, and `/opt/life-loop` deployment runbook.
- Add migration discipline and rollback notes for each schema change.
- Validate Docker Compose config, health endpoints, CI, and absence of `/home/deploy` production paths.

### 10. Final MVP Audit
- Run architecture, code, release-readiness, UI, transition, reduced-motion, security, and VPS QA checklists.
- Update backlog/docs with completed work, intentional deferrals, and governing ADRs.
- Acceptance target: clone, install, start infra, migrate DB, start web/API/agent, enroll device, register storage target, bind local target, run ingest/archive/verify/restore-drill flows, view status/activity, and pass CI-quality checks.

## Validation Policy
- Run targeted package checks for the touched subsystem.
- Run `pnpm check` before each commit unless the change is docs-only and `pnpm docs:check` is sufficient.
- If a target validation command cannot run in the local environment, document the reason in the final update and prefer adding a deterministic replacement check.
