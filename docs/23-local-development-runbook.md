# 23. Local Development Runbook

This runbook is for a fresh local clone. It does not require production secrets and does not turn the VPS or API into the archive for originals.

## Prerequisites
- Node.js 22
- pnpm 10
- Go 1.23
- Docker with Compose v2

## First Setup
1. Install dependencies:
   ```sh
   pnpm install --frozen-lockfile
   ```
2. Start local Postgres:
   ```sh
   pnpm infra:up
   ```
3. Run migrations:
   ```sh
   pnpm db:migrate
   ```
4. Start web and API:
   ```sh
   pnpm dev
   ```
5. Open the web control plane:
   ```text
   http://localhost:3000
   ```

## Health Checks
With `pnpm dev` running, check:
- Web: `http://localhost:3000/api/health`
- API live: `http://localhost:4000/health/live`
- API ready: `http://localhost:4000/health/ready`

Or run:

```sh
pnpm smoke:health
```

## Quality Gates
Run before committing implementation work:

```sh
pnpm check
```

For CI-equivalent build coverage, use explicit fake Clerk build-time values:

```sh
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5hY2NvdW50cy5kZXYk \
CLERK_SECRET_KEY=sk_test_build_time_placeholder_for_static_ci_build \
pnpm build
```

Real production deployments must use real Clerk configuration.

## Clerk Auth Modes
Local bootstrap mode is active when `CLERK_ISSUER_URL` is empty for the API and Clerk keys are empty for the web app. In that mode the onboarding form accepts explicit owner identity fields so a developer can create local records without external secrets.

Authenticated mode requires:

```sh
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<real-publishable-key>
CLERK_SECRET_KEY=<real-secret-key>
CLERK_ISSUER_URL=<real-clerk-issuer-url>
```

When authenticated mode is enabled, web routes are protected by Clerk middleware, onboarding sends a Clerk session token to the API, and API write routes derive `owner/requestedBy` from Clerk instead of trusting body-provided user ids. Device agent calls still use device-scoped credentials rather than Clerk sessions.

## Desktop Agent Bootstrap
The desktop agent is a local data-plane process. It must not upload raw local filesystem paths to the control plane.

Run from the agent package:

```sh
cd apps/desktop-agent
LIFE_LOOP_CONTROL_PLANE_URL=http://localhost:4000 \
LIFE_LOOP_ENROLLMENT_TOKEN=<one-time-token-from-control-plane> \
go run ./cmd/life-loop-agent
```

After enrollment, the agent stores a device-scoped credential in its local config path. Later starts can use the saved credential automatically or use `LIFE_LOOP_DEVICE_CREDENTIAL` for an explicit local override.

Storage target bindings are agent-local JSON:

```json
{
  "bindings": [
    {
      "storageTargetId": "00000000-0000-0000-0000-000000000000",
      "provider": "local-disk",
      "rootPath": "/absolute/archive/root"
    }
  ]
}
```

Rules:
- `rootPath` must be absolute.
- Duplicate `storageTargetId` entries are invalid.
- The control plane owns target identity, role, provider, and control-plane health state.
- The agent owns raw local path resolution and local filesystem health checks.

## Local Teardown
Stop services:

```sh
pnpm infra:down
```

Do not use destructive Docker volume removal unless you intentionally want to delete local development database state.
