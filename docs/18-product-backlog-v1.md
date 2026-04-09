# 18. Product Backlog v1

## Epic 1 — Repository and Developer Foundation
- Initialize monorepo structure
- Configure package manager, task runner, TypeScript baseline
- Add lint/typecheck/test scripts
- Add CI pipeline
- Add docs validation scripts
- Add root README and runbook index

## Epic 2 — Design System Foundation
- Implement design tokens package
- Implement UI package baseline
- Define app shell layout primitives
- Add typography, spacing, color, radius, shadow tokens
- Add empty/loading/error state patterns
- Add responsive navigation primitives

## Epic 3 — Control Plane Web App
- Implement auth integration shell
- Implement dashboard shell
- Implement libraries/devices/storage targets navigation
- Implement settings/billing placeholders
- Implement health/status surfaces
- Implement onboarding shell

## Epic 4 — API and Domain Core
- Implement typed config
- Implement health route
- Implement structured logging
- Implement DB schema v1
- Implement storage target model
- Implement device registration model
- Implement placement state model
- Implement basic job model

## Epic 5 — Desktop Agent Skeleton
- Implement config loader
- Implement registration handshake placeholder
- Implement health/heartbeat plumbing
- Implement storage target detection abstraction
- Implement future job executor boundaries

## Epic 6 — Observability and Operations
- Add correlation IDs
- Add baseline telemetry hooks
- Add healthcheck logic
- Add Docker production template alignment
- Add deployment/runbook docs

## Epic 7 — MVP Safety
- Add delete guardrails
- Add explicit state vocabulary in API and UI
- Add restore-drill tracking model
- Add audit/logging surfaces
- Add failure-state UX placeholders

## Deferred after MVP
- local-network-first iPhone ingest
- BYO storage integrations
- advanced workflow engine
- automatic restore drill orchestration
- AI features beyond clearly bounded assistive surfaces
