# 12. VPS Infrastructure Baseline

## Current baseline
Single Hetzner VPS with shared infrastructure and Docker Compose per project.

## Canonical rules
- production path: `/opt/<project>`
- shared reverse proxy: `/opt/traefik`
- shared monitoring: `/opt/monitoring`
- shared scripts: `/opt/scripts`
- backups: `/opt/backups`
- no permanent prod apps in `/home/deploy`

## Project deployment rules
- Docker Compose
- `docker-compose.prod.yml`
- secrets only in `.env.production`
- persistent data must survive recreate
- healthcheck required for long-running services
- `restart: unless-stopped`
- logs to stdout/stderr

## Recommended Life-Loop deployment split
### `/opt/life-loop-api`
- control plane API
- Postgres connectivity
- optional worker

### `/opt/life-loop-web`
- Next.js web app behind shared Traefik

### `/opt/life-loop-agent` (optional if server-side workers exist)
- only if needed; most desktop agent logic remains on user machines

## Important note
Do not over-centralize data plane behavior on the VPS. The VPS is primarily a control plane and optional preview/selected-online layer.
