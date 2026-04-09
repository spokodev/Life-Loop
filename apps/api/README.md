# apps/api

Hono-based control plane API.

## Responsibility
- auth boundary integration
- users, libraries, and devices registry
- manifests and lifecycle state
- job orchestration metadata
- storage target registry
- restore-drill tracking
- audit logs and health signals

## Not responsible for
- direct writes to user HDD/SSD
- acting as canonical origin for all originals
- implying that staged or uploaded data is already archival-safe
