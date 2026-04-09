# ADR-003: Storage Provider Abstraction

## Decision
All storage integrations must implement a shared provider contract rather than branching ad hoc logic across the system.

## Rationale
This keeps HDD, SSD, S3, NAS, and future providers from creating architecture sprawl.

## Consequences
- providers become a controlled extension point
- tests can run against contract fixtures
