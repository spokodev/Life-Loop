# ADR-006: Auth Provider = Clerk

## Status
Accepted

## Context
Life-Loop needs secure authentication, future-ready multi-tenant support, organization/workspace semantics, device linking, and a fast path to production without building custom auth infrastructure.

## Decision
Use **Clerk** as the auth provider for Phase 1 and Phase 2 hosted deployment.

## Why
- Strong support for modern auth flows.
- Good fit for SaaS onboarding and account lifecycle.
- Organizations model maps well to future multi-user/team scenarios.
- Reduces implementation time and security burden versus custom auth.

## Consequences
### Positive
- Faster implementation.
- Lower security risk than rolling custom auth.
- Cleaner path for invitations, organizations, sessions, and user management.

### Trade-offs
- External dependency.
- Future self-hosted identity mode would need a migration ADR.

## Revisit Trigger
Revisit only if:
- self-hosted enterprise identity becomes a requirement, or
- Clerk cost / product constraints become unacceptable.
