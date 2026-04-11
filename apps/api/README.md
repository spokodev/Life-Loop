# apps/api

Hono-based control plane API.

## Responsibility
- auth boundary integration
- users, libraries, and devices registry
- manifests and lifecycle state
- job orchestration metadata
- storage target registry
- device-credential-scoped reads for agent storage target coverage
- hosted iPhone staging reservations and temporary upload storage
- restore-drill tracking
- audit logs and health signals

## Not responsible for
- direct writes to user HDD/SSD
- acting as canonical origin for all originals
- implying that staged or uploaded data is already archival-safe
- deleting staged, phone, or archive originals through hidden retention automation
