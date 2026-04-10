# ADR-018: Postgres Job Claim and Lease Protocol

## Status
Accepted for MVP

## Context
ADR-008 selects a Postgres-backed internal job model for MVP, but it does not define how desktop agents or API workers claim, lease, heartbeat, retry, block, and complete jobs.

This protocol must be explicit because Life-Loop must not hide automation. Job state must remain observable, retry-safe, scoped to the authenticated device/library, and conservative around archive safety.

## Decision
For MVP:

1. Jobs remain rows in `job_runs`; no external queue or workflow engine is introduced.
2. Claiming is explicit through an API endpoint. There is no hidden background executor in the API process.
3. A claim can only be made by an authenticated device credential and is scoped to that device's library.
4. Claimable jobs are `queued` and `retrying` jobs for the authenticated library. Terminal jobs are never claimable.
5. Claiming uses a Postgres transaction with row-level locking (`for update skip locked`) so duplicate concurrent claims cannot receive the same job.
6. A claimed job moves to `running` and records:
   - `claimed_by_device_id`,
   - `lease_token`,
   - `lease_expires_at`,
   - `last_heartbeat_at`,
   - `started_at`.
7. The lease token is a random server-generated token returned only to the claiming device. Mutating a running claim requires both device credential and lease token.
8. Heartbeat extends the lease and updates `last_heartbeat_at` without changing archive safety state.
9. Lease timeout does not run as hidden automation. A later explicit claim request may recover an expired `running` job by moving it back to claimable retry state inside the claim transaction.
10. Completion transitions are explicit:
    - `succeeded`,
    - `completed_with_warnings`,
    - `failed`,
    - `blocked`.
11. `blocked` and `completed_with_warnings` require an operator-readable reason. `failed` should include a safe error class/reason when available.
12. Retry transitions are explicit. `attempt_count` increments when a job returns to `retrying`; max-attempt policy can be added later, but MVP must record the count.
13. The desktop agent must not upload raw local paths through job claim, heartbeat, or completion payloads. It may report target ids, checksums, placement outcomes, health state, and safe error classes.
14. Jobs and activity surfaces remain the observable state for operators.

## Guardrails
- Do not implement an always-on hidden worker in the API process.
- Do not allow user Clerk sessions to claim device-agent jobs.
- Do not allow device credentials to create user/account/billing jobs.
- Do not allow expired leases to complete without being explicitly reclaimed.
- Do not treat `running` as archive-safe.
- Do not infer cleanup eligibility from job success alone.

## Consequences
### Positive
- Keeps job execution explicit and auditable.
- Gives the desktop agent a safe, scoped claim protocol.
- Allows safe recovery from crashes without adding a queue service.

### Trade-offs
- Lease recovery happens only when an explicit claimant asks for work.
- More SQL discipline is required around row locks and transitions.
- Long-running jobs need periodic heartbeat calls.

## Revisit Trigger
Revisit when:
- claim throughput or job fan-out outgrows a single Postgres queue,
- multiple worker classes need priority scheduling,
- max-attempt and dead-letter policy becomes product-critical, or
- a dedicated workflow engine becomes justified.
