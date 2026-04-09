# ADR-005: Delete and Retention Policy

## Decision
Delete and cleanup are independent policy-driven workflows, not side effects of ingest or archive completion.

## Rationale
This reduces accidental data loss and keeps the user's mental model clear.

## Consequences
- separate cleanup UI and service logic
- explicit eligibility model
- stronger auditability
