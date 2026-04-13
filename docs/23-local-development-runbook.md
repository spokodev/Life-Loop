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

## Stripe Billing Mode
Billing is disabled unless Stripe env is configured. When any Stripe billing variable is set, the API requires the complete set:

```sh
STRIPE_SECRET_KEY=<real-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<real-stripe-webhook-secret>
STRIPE_CHECKOUT_PRICE_ID=<stripe-price-id>
STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/settings?checkout=success
STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/settings?checkout=cancelled
STRIPE_PORTAL_RETURN_URL=http://localhost:3000/settings
```

Run migrations after pulling billing schema changes:

```sh
pnpm db:migrate
```

Rollback note for migration `0006_billing_projection.sql`: before production use, take a database backup; rollback is limited to dropping `billing_events`, `billing_subscriptions`, and `billing_customers` because the current migration runner is forward-only.

The billing projection is display-only for MVP. Stripe webhook events must verify signatures before persistence, and billing state must not change archive health, restore readiness, cleanup eligibility, or device-agent execution.

## Job Claim Leases
Migration `0007_job_claim_leases.sql` adds the claim/lease fields required by ADR-018. Run `pnpm db:migrate` after pulling it before exercising device-agent job claims.

Device agents claim work with a device credential, not a Clerk user token:

```sh
curl -sS -X POST http://localhost:4000/v1/jobs/claims \
  -H "Authorization: Bearer <device-credential>" \
  -H "Content-Type: application/json" \
  -d '{"kinds":["archive-placement"],"leaseSeconds":300}'
```

The API returns safe job metadata plus an opaque `leaseToken`. Heartbeat and completion calls must include both the same device credential and the lease token. Expired `running` leases are recovered only during an explicit later claim request; the API does not run a hidden background executor.

Executable desktop-agent claims may include an ADR-019 `execution` manifest. Placement verification can run from `storageTargetId`, `provider`, `relativePath`, and `checksumSha256`; hosted-staging archive placement uses the ADR-022 lease-authorized fetch route plus the desktop agent's local provider `Put` path. Agent-local staging remains safely blocked until a local source manifest exists.

With local Postgres running and migrations applied, the hosted-staging archive handoff smoke can be run explicitly:

```sh
pnpm test:db:api
```

This DB-backed smoke runs serially because it applies migrations against a shared local database. It covers iOS staging upload, desktop-device claim scoping, invalid lease rejection, staged-byte fetch, `archiving` status separation from archive safety, a verified placement ingest report, expired hosted-staging object rejection, duplicate concurrent job claims, wrong lease completion, required warning reasons, device-targeted jobs, cross-library scoping, terminal jobs, and explicit expired-lease recovery.

Rollback note for migration `0007_job_claim_leases.sql`: before production use, take a database backup; rollback is limited to dropping claim/lease indexes and columns on `job_runs` because the current migration runner is forward-only.

Migration `0008_restore_drill_evidence.sql` adds restore-drill evidence rows. Evidence is separate from restore-readiness metadata: a drill can pass only after sampled assets have explicit `verified` evidence records. Rollback is limited to dropping `restore_drill_evidence` because the current migration runner is forward-only.

Migration `0010_restore_evidence_asset_fk_cascade.sql` normalizes the restore evidence asset foreign key to `on delete cascade` for existing databases. This keeps `asset_id` non-null while preserving clean library/asset deletion during tests and operator cleanup. Rollback requires dropping and recreating that foreign key with the previous action, so take a backup before production migration.

## Cleanup Review
Cleanup is manual-only in MVP. The control plane exposes a read-only cleanup review projection:

```sh
curl -sS http://localhost:4000/v1/cleanup/review
```

The projection is blocked unless an asset has a verified archive-primary placement, verified archive-replica placement, and asset-level verified restore-drill evidence from a passed drill. The web cleanup screen is available at `http://localhost:3000/cleanup`.

This slice adds no database migration, no delete endpoint, no lifecycle-state mutation, and no auto-delete behavior. Upload or hosted staging success alone must never create cleanup eligibility.

## Hosted iPhone Staging Policy
ADR-021 defines the MVP hosted-staging policy before iPhone ingest implementation:
- maximum object size: 2 GiB,
- maximum pending staged bytes per library: 25 GiB,
- maximum pending staged objects per library: 500,
- upload reservation expiry: 24 hours,
- completed staging retention: 7 days,
- post-archive staging retention eligibility: 24 hours after verified primary, verified replica, and restore evidence exist.

Hosted staging is temporary convenience storage, not archive-primary or archive-replica storage. Upload completion must never mark an asset archived, verified, restore-ready, cleanup-eligible, or safe to remove from the phone.

Migration `0009_hosted_staging_objects.sql` adds hosted staging metadata. Rollback is limited to dropping `hosted_staging_objects` and its indexes because the current migration runner is forward-only.

Local API staging writes use `HOSTED_STAGING_ROOT`, defaulting to `/tmp/life-loop-staging`. To reserve and upload from an enrolled, active iOS device credential:

```sh
curl -sS -X POST http://localhost:4000/v1/mobile/staging/reservations \
  -H "Authorization: Bearer <ios-device-credential>" \
  -H "Content-Type: application/json" \
  -d '{"libraryId":"<library-id>","filename":"IMG_0001.JPG","contentType":"image/jpeg","checksumSha256":"<64-char-sha256>","sizeBytes":12345}'
```

The reservation response returns a `PUT` upload URL. Upload success returns `staged`; it does not create archive verification, restore readiness, or cleanup eligibility.

The iOS foundation lives in `apps/ios`:

```sh
cd apps/ios
swift test
xcodebuild -scheme LifeLoopiOS -destination 'generic/platform=iOS' build
```

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
