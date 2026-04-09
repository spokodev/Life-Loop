# ADR-007: API Framework = Hono

## Status
Accepted

## Context
Life-Loop needs a typed TypeScript API for web, iOS, desktop agent, and future integrations. The system should stay lightweight and maintainable on a single VPS.

## Decision
Use **Hono** for `apps/api`.

## Why
- Lightweight and easy to reason about.
- Works well in TypeScript-first stacks.
- Fits the platform model without forcing a larger framework than needed.
- Keeps the API boundary explicit instead of burying everything inside the web app.

## Consequences
### Positive
- Small, understandable API surface.
- Good fit with monorepo shared types and validation.
- Easier future separation between web and API concerns.

### Trade-offs
- Slightly more setup than putting everything inside Next.js routes.
- Team must keep shared contracts disciplined.

## Notes
`apps/web` still uses **Next.js App Router** for the control plane UI.
