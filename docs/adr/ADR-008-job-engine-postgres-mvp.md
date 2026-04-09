# ADR-008: Background Job Engine = Postgres-backed MVP

## Status
Accepted for MVP

## Context
Life-Loop needs background processing for manifests, previews, verification jobs, storage placement work, and operational maintenance. The first deployment target is a single Hetzner VPS.

## Decision
For MVP, use a **Postgres-backed job model** managed by the platform itself instead of introducing a dedicated workflow platform on day one.

## Why
- Simpler operational model for a single VPS.
- Easier to debug during early development.
- Enough for MVP-scale retries, status tracking, and failure inspection.

## Consequences
### Positive
- Lower infrastructure complexity.
- Faster implementation.
- Easier local development.

### Trade-offs
- Less durable / feature-rich than a dedicated workflow system.
- May need migration later if throughput and orchestration complexity increase.

## Revisit Trigger
Revisit when:
- job fan-out grows substantially,
- long-running workflows become hard to reason about, or
- retry / scheduling semantics become too complex.
