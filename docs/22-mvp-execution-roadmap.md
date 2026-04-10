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
- Improve README/runbooks so a fresh developer can install dependencies, start local infra, migrate the database, run web/API/agent, and validate health endpoints. **Partial:** README now documents health smoke validation.
- Add smoke-test scripts only when they run locally without external secrets. **Done:** `pnpm smoke:health` checks web/API health endpoints when services are running.

### 2. Auth and Tenant Safety
- Finish Clerk integration for web route protection and authenticated owner context.
- Enforce Clerk identity on user-owned API write paths when auth is enabled.
- Preserve documented bootstrap mode for local development.
- Test auth-disabled bootstrap behavior, auth-enabled missing Clerk identity, and device credential scoping.

### 3. Billing
- Add Stripe config validation for Checkout, Billing, Customer Portal, and webhook signature verification.
- Keep billing UI Stripe-hosted and explicit.
- Do not implement custom subscription logic beyond plan/status display and safe webhook persistence.
- Test missing signature, invalid signature, known subscription events, and separation from archive health.

### 4. Job Execution Architecture
- Add an ADR for the concrete Postgres-backed job claim, lease, and heartbeat protocol before coding an executor.
- Implement explicit claim, lease timeout, transition, retry, blocked, and terminal-state APIs without hidden automation.
- Scope agent job claims to authenticated device/library.
- Keep job state observable through jobs and activity surfaces.
- Test duplicate claims, terminal jobs, retry transitions, and blocked reasons.

### 5. Desktop Archive Executor
- Implement agent polling/claim loop only after the job protocol ADR is accepted.
- Execute archive-placement and placement-verification through the provider abstraction and local binding map.
- Use temp writes, checksum verification, atomic rename, durable state transitions, and quarantine/blocking behavior for partial-copy failures.
- Report only target ids, placement outcomes, checksums, health state, and safe error classes.
- Test missing binding, provider mismatch, checksum mismatch, disk unavailable, retry-safe rerun, and unsupported future provider.

### 6. Restore Execution
- Add explicit restore job semantics distinct from restore-readiness views.
- Implement restore-drill execution for small samples.
- Record drill state and surface pass/fail history in API and web.
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
