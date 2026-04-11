# 24. Production Deployment Runbook

This runbook is the Phase 1 VPS deployment baseline. It follows `docs/12-vps-infrastructure-baseline.md`: one Hetzner VPS, Docker Compose for this project, persistent data under `/opt/life-loop`, and the existing shared Traefik network.

## Scope
- Control plane API, web app, and Postgres run as Compose services.
- Hosted staging is temporary convenience storage under `/opt/life-loop/data/staging`.
- The VPS must not become the primary archive for originals.
- Desktop archive execution remains on enrolled user devices.
- Cleanup and retention actions remain explicit and manual for MVP.

## Directory Layout
Create this layout on the VPS:

```sh
sudo mkdir -p /opt/life-loop/data/postgres
sudo mkdir -p /opt/life-loop/data/staging
sudo mkdir -p /opt/life-loop/backups
sudo mkdir -p /opt/life-loop/releases
```

The deployment bundle should place these files together:

```text
/opt/life-loop/docker-compose.prod.yml
/opt/life-loop/.env.production
```

Copy `infra/docker/docker-compose.prod.template.yml` to `/opt/life-loop/docker-compose.prod.yml`, then copy `infra/docker/.env.production.example` to `/opt/life-loop/.env.production` and replace every placeholder secret or host value with production values.

## Environment
Required production settings:

```sh
LIFE_LOOP_API_IMAGE=ghcr.io/<owner>/life-loop-api:<tag>
LIFE_LOOP_WEB_IMAGE=ghcr.io/<owner>/life-loop-web:<tag>
LIFE_LOOP_API_HOST=api.example.com
LIFE_LOOP_WEB_HOST=app.example.com
NEXT_PUBLIC_APP_URL=https://app.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
CORS_ORIGIN=https://app.example.com
DATABASE_URL=postgres://lifeloop:<postgres-password>@postgres:5432/lifeloop
HOSTED_STAGING_ROOT=/opt/life-loop/data/staging
POSTGRES_DATA_ROOT=/opt/life-loop/data/postgres
POSTGRES_DB=lifeloop
POSTGRES_USER=lifeloop
POSTGRES_PASSWORD=<postgres-password>
```

Clerk and Stripe values remain blank only for non-public bootstrap testing. Production auth and billing require real values in `.env.production`.

Public Next.js variables are build-time inputs for normal Next.js images. Build and tag the web image for the target environment whenever `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, or `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` changes.

## Preflight
Run from the repository before copying templates:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm prod:check
```

Run on the VPS after editing `.env.production`:

```sh
cd /opt/life-loop
docker compose --env-file .env.production -f docker-compose.prod.yml config
```

The rendered config must show the shared `traefik` external network, healthchecks, restart policies, and persistent data under `/opt/life-loop/data`.

## Deployment
Pull images and start services:

```sh
cd /opt/life-loop
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Run migrations explicitly after Postgres is healthy and before routing production traffic to a new API version:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec api pnpm db:migrate
```

If the runtime image does not include workspace package manager metadata, run the API package migration command in the matching release image before promotion and record the exact command in the release notes.

## Health Checks
Validate service health:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -fsS https://api.example.com/health/live
curl -fsS https://api.example.com/health/ready
curl -fsS https://app.example.com/api/health
```

The API readiness endpoint depends on database connectivity. A live-only pass is insufficient for release acceptance.

## Backup
Create a logical Postgres backup before migrations and before any deploy that changes database access patterns:

```sh
cd /opt/life-loop
backup_name="/opt/life-loop/backups/life-loop-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_name"
```

Keep hosted staging out of archive-safety claims. Staging files may be backed up for operational recovery, but they must not be documented or treated as primary or replica archive storage.

## Restore Drill
Verify a backup on a disposable database before relying on it:

```sh
createdb life_loop_restore_check
pg_restore --clean --if-exists --dbname life_loop_restore_check /opt/life-loop/backups/<backup-file>.dump
dropdb life_loop_restore_check
```

For VPS-local restore drills, use a disposable database or an isolated container. Never restore over production without an explicit incident plan.

## Rollback
Rollback is image-first, data-careful:

1. Stop routing traffic if the failure affects writes.
2. Capture logs with `docker compose --env-file .env.production -f docker-compose.prod.yml logs --no-color`.
3. Restore the previous `LIFE_LOOP_API_IMAGE` and `LIFE_LOOP_WEB_IMAGE` tags in `.env.production`.
4. Run `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`.
5. Do not roll back a schema migration by guessing. Use the migration notes for that release; if no reversible migration exists, restore from the pre-migration backup into a new database and cut over deliberately.

## Release Notes
Every production release should record:
- Git commit SHA and image tags.
- Migration files introduced since the previous deploy.
- Backup file path and restore-drill result.
- Health endpoint results.
- Any intentionally deferred safety-critical behavior.
