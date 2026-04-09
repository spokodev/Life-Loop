# ADR-012: Restore Drills Are Mandatory

## Status
Accepted

## Context
Life-Loop is an archival system. Backup claims are meaningless without regular restore validation.

## Decision
Restore drills are required from MVP onward.

## Minimum Policy
- monthly restore drill for a small asset sample
- explicit verification that restored assets are usable
- documented source-of-truth rules
- restore logging and drill history
- Postgres backup strategy must remain PITR-ready in the hosted environment

## Why
- Prevents false confidence.
- Catches backup and metadata drift early.
- Supports the product promise of trustworthy archival.

## Consequences
### Positive
- Stronger operational safety.
- Better customer trust.

### Trade-offs
- More operational work.
- Some automation deferred until later phases.

## Guardrail
No feature or UI copy should imply archival safety unless restore expectations are supportable.
