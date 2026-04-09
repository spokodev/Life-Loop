# apps/web

Next.js App Router control plane UI for the hosted plane.

## Responsibility
- onboarding shell
- archive health dashboards
- device enrollment surfaces
- storage target management
- billing and settings placeholders
- cleanup and restore review surfaces

## Constraints
- no direct disk I/O
- no implicit destructive actions
- every archive state shown explicitly
- Clerk remains the production auth provider
- uploaded never means safe to delete
