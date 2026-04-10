# ADR-016: Clerk User Auth and Tenant Scope

## Status
Accepted for MVP

## Context
ADR-006 selects Clerk as the user auth provider. ADR-014 separately defines device-scoped credentials for desktop agents.

What still needs an explicit MVP boundary is how user-authenticated web/API actions are scoped without confusing Clerk user sessions with device credentials or local bootstrap mode.

This matters because Life-Loop has user-owned libraries, devices, storage targets, jobs, and future billing state. It must not let bootstrap convenience become a production authorization model.

## Decision
For MVP:

1. Clerk is the source of truth for user identity in hosted web/API flows.
2. Device credentials remain a separate machine-auth path and must not be treated as user auth.
3. API user-auth is enabled when `CLERK_ISSUER_URL` is configured.
4. When API user-auth is enabled, user-owned write actions must derive actor identity from the authenticated Clerk session/token instead of trusting client-supplied `requestedBy` or `owner.clerkUserId`.
5. When API user-auth is disabled, local bootstrap mode may continue to accept explicit owner/requestedBy identity fields for development only.
6. Tenant scope for MVP is library-owner based. A user-authenticated request may operate on libraries owned by that Clerk user; organization/team scoping is deferred until organization membership is implemented.
7. Web route protection should use Clerk middleware/provider when Clerk keys are configured and keep the existing explicit bootstrap messaging when they are not.

## Guardrails
- Do not require device agents to carry Clerk sessions.
- Do not allow device credentials to perform user/account/billing actions.
- Do not trust client-provided Clerk user ids while auth is enabled.
- Do not add ad-hoc tenant bypasses for convenience.
- Do not add custom identity storage beyond the existing users/libraries model unless a later ADR changes the tenant model.

## Consequences
### Positive
- Keeps user auth and device auth cleanly separated.
- Preserves local development without production-auth drift.
- Gives API route implementation a clear rule for actor identity and library ownership checks.

### Trade-offs
- Organization membership is intentionally deferred.
- API routes need shared Clerk verification middleware/helper code instead of per-route improvisation.
- Some current bootstrap forms must adapt to authenticated identity rather than manually entered Clerk ids.

## Revisit Trigger
Revisit when:
- Clerk Organizations are wired into billing and tenant membership,
- team libraries require role-based access control,
- self-hosted identity becomes a requirement, or
- mobile user sessions need a distinct token exchange model.
