# 13b. Repo Bootstrap Pack

## Monorepo choice
Use pnpm workspaces + Turborepo.

Why:
- conventional workspace structure
- fast local and CI task orchestration
- good fit for apps + shared packages
- strong incremental scaling path

## Proposed structure
- `apps/web`
- `apps/api`
- `apps/desktop-agent`
- `packages/shared-types`
- `packages/ui`
- `packages/design-tokens`
- `packages/config`
- `docs`
- `infra`
- `.github/workflows`

## Why not overcomplicate
For your current size and single-owner operating model, this is simpler and more maintainable than splitting into many repos too early.

## Initial CI checks
- repo lint
- typecheck
- docs presence checks
- future: API tests and UI smoke tests

## Immediate next implementation steps
1. initialize Next.js app in `apps/web`
2. initialize API service in `apps/api`
3. define DB schema v1
4. draft agent protocol
5. implement shared domain types
6. implement first archive health dashboard mock
