# 11. MCP Strategy

## Why MCP matters here
Life-Loop needs disciplined AI-assisted engineering, not random tool sprawl.

## Guiding rule
Choose MCP servers to strengthen the engineering loop:
design -> implement -> review -> verify -> release

## Phase 1 MCP set
### 1. Filesystem / repo MCP
Purpose:
- read docs
- inspect source
- validate repo structure

Permissions:
- read/write in dev only

### 2. GitHub MCP
Purpose:
- PR review
- diff inspection
- issue linking
- release notes

Permissions:
- read by default
- commenting allowed
- merge disabled by default

### 3. Postgres MCP
Purpose:
- inspect schema
- validate migrations
- query non-production dev/staging state

Permissions:
- read-only on staging/prod by default

### 4. Browser / E2E MCP
Purpose:
- onboarding smoke tests
- UI regression checks
- archive state UI verification

Permissions:
- test/staging first

### 5. Docs MCP
Purpose:
- ground AI against repo docs, ADRs, runbooks, standards

## Phase 2 MCP set
- SSH / infra MCP
- Docker MCP
- object storage MCP
- logs / monitoring MCP

## Rules
- read-mostly by default
- separate dev / staging / prod contexts
- destructive operations require explicit human approval
- document every MCP in `docs/12-vps-infrastructure-baseline.md` and future infra docs

## MCP server design guidance
If you later build project-specific MCP servers, prefer small, bounded servers:
- `lifeloop-repo`
- `lifeloop-db`
- `lifeloop-infra`
- `lifeloop-observability`

Avoid one mega-MCP with broad write access everywhere.
