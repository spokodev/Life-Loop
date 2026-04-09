# 06. Control Plane Architecture

## Responsibilities
- account and auth
- library and device registry
- storage target registry
- manifests
- job metadata
- health state
- notifications
- audit trail

## Responsibilities it must NOT take on
- direct block/file writes to user disks
- pretending that “upload complete” equals “archive safe”

## Service slices
- auth service
- library service
- device service
- storage registry service
- manifest service
- job orchestration service
- notification service
- audit service

## Recommended API style
- explicit state transition endpoints
- idempotency keys for mutation-heavy actions
- structured problem responses
- event emission for major transitions
