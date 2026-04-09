# ADR-002: Local-First Originals

## Decision
Originals are primarily archived to user-controlled local/external storage. VPS-managed storage is optional and role-limited.

## Rationale
This lowers cost, reduces cloud dependency, and aligns with the product's trust promise.

## Consequences
- previews and selected-online content are separate from archive-primary semantics
- delete eligibility depends on verified placements, not mere uploads
