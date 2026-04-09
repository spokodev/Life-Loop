# ADR-010: iOS Ingest Flow = Cloud-staging First for MVP

## Status
Accepted for MVP

## Context
Life-Loop needs a reliable iPhone ingest path. Two candidate directions existed:
1. local-network-first to a nearby desktop agent
2. cloud-staging-first via hosted endpoint

## Decision
For MVP, use **cloud-staging-first** as the primary iPhone ingest flow.

## Why
- Simpler to ship reliably.
- Better fit with background upload behavior.
- Fewer discovery and LAN edge cases in the first release.
- Cleaner status reporting from mobile into the control plane.

## Phase 2
Add **local-network / nearby ingest** later as an optimized path, not as the MVP requirement.

## Consequences
### Positive
- Faster and more reliable MVP.
- Better alignment with hosted control-plane status model.

### Trade-offs
- Some large transfers may be slower than direct local handoff.
- Requires careful hosted storage limits and retention policy.

## Guardrail
"Uploaded" must never be shown as equivalent to "safely archived".
