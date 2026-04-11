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

## Recommended Life-Loop deployment layout
### `/opt/life-loop`
- `docker-compose.prod.yml`
- `.env.production`
- control plane API service
- Next.js web app service behind shared Traefik
- Postgres service and persistent data under `/opt/life-loop/data/postgres`
- hosted staging convenience storage under `/opt/life-loop/data/staging`
- backups under `/opt/life-loop/backups`

### Desktop agents
- Most desktop agent logic remains on user machines.
- Do not add a server-side archive executor unless a future ADR changes the data-plane boundary.

## Important note
Do not over-centralize data plane behavior on the VPS. The VPS is primarily a control plane and optional preview/selected-online layer.
