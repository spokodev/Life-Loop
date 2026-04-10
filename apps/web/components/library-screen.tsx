'use client'

import type { Asset, DashboardSnapshot } from '@life-loop/shared-types'
import {
  AppShell,
  Banner,
  Button,
  Card,
  EmptyState,
  StatusRow,
  TransitionState,
} from '@life-loop/ui'
import { useRouter } from 'next/navigation'

import { buildPrimaryNavItems } from './primary-nav'

export function LibraryScreen({
  assets,
  apiBaseUrl,
  authEnabled,
  snapshot,
  usingAssetsFallback,
  usingSnapshotFallback,
}: {
  assets: Asset[]
  apiBaseUrl: string
  authEnabled: boolean
  snapshot: DashboardSnapshot
  usingAssetsFallback: boolean
  usingSnapshotFallback: boolean
}) {
  const router = useRouter()
  const hasLibraries = snapshot.libraries.length > 0
  const hasAssets = assets.length > 0
  const safeArchivedAssets = assets.filter(
    (asset) => asset.lifecycleState === 'safe_archived',
  ).length
  const pendingArchiveAssets = assets.filter(
    (asset) => asset.lifecycleState !== 'safe_archived',
  ).length
  const verifiedPlacementCount = assets.reduce(
    (total, asset) => total + asset.verifiedPlacementCount,
    0,
  )
  const blobCount = assets.reduce((total, asset) => total + asset.blobCount, 0)

  return (
    <AppShell
      actions={
        <Button onClick={() => router.push('/onboarding')}>
          {hasLibraries ? 'Add library context' : 'Create first library'}
        </Button>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Library')}
      summary="Library answers what exists. It stays explicit about archive context and never treats preview presence as archival safety."
      title="Library"
    >
      {usingSnapshotFallback || usingAssetsFallback ? (
        <Banner
          description="Part of the library inventory is unavailable, so this screen falls back to conservative empty-state assumptions instead of inferring archival safety."
          title="Library inventory partially unavailable"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={
          !hasLibraries
            ? 'No libraries exist yet, so there is no archive context to reason about.'
            : !hasAssets
              ? 'Library records exist, but no device has reported durable asset or placement state yet.'
              : safeArchivedAssets === assets.length
                ? 'All visible assets have both primary and replica verification recorded in the control plane.'
                : safeArchivedAssets > 0
                  ? 'Some assets are durably archived, while others still need verification or replica completion.'
                  : 'Asset ingest is reporting into the control plane, but nothing visible is fully safe-archived yet.'
        }
        nextAction={
          !hasLibraries
            ? 'Create the first library to anchor archive truth.'
            : !hasAssets
              ? 'Redeem an agent device and report the first archive-primary placement.'
              : safeArchivedAssets === assets.length
                ? 'Continue ingest or review restore and activity surfaces.'
                : 'Finish primary or replica verification before treating pending assets as durably safe.'
        }
        safeNow={
          !hasAssets
            ? 'No asset is being treated as archived, verified, or cleanup-ready on this screen.'
            : safeArchivedAssets === assets.length
              ? 'The listed assets are recorded as safe-archived, but cleanup eligibility remains a separate policy step.'
              : 'Only assets explicitly shown as safe-archived should be treated as durably protected.'
        }
        state={
          !hasLibraries
            ? 'empty'
            : !hasAssets
              ? 'empty'
              : safeArchivedAssets === assets.length
                ? 'success'
                : safeArchivedAssets > 0
                  ? 'partial-success'
                  : 'completed-with-warnings'
        }
        title={
          !hasLibraries
            ? 'No library context yet'
            : !hasAssets
              ? 'Library ready for first ingest'
              : safeArchivedAssets === assets.length
                ? 'Current assets are durably archived'
                : safeArchivedAssets > 0
                  ? 'Archive safety is mixed'
                  : 'Asset archive work is still in progress'
        }
      />

      {hasLibraries ? (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                Assets
              </p>
              <h2 className="text-xl font-semibold text-foreground">Recent archive inventory</h2>
            </div>
            {hasAssets ? (
              <div className="divide-y divide-border">
                {assets.map((asset) => (
                  <StatusRow
                    key={asset.id}
                    label={asset.filename}
                    meta={`${describeLifecycle(asset.lifecycleState)} • ${asset.verifiedPlacementCount}/${asset.placementCount} placements verified`}
                    tone={assetTone(asset.lifecycleState)}
                    value={`${asset.blobCount} blobs`}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                actionLabel="Open onboarding"
                description="The library exists, but no authenticated device has reported a completed ingest write path yet."
                icon="◍"
                onAction={() => router.push('/onboarding')}
                secondary="The next safe step is a verified archive-primary placement report from the desktop agent."
                title="No asset inventory yet"
              />
            )}
          </Card>

          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                What exists
              </p>
              <h2 className="text-xl font-semibold text-foreground">Inventory baseline</h2>
            </div>
            <div className="divide-y divide-border">
              <StatusRow
                label="Library count"
                meta="This is the explicit archive namespace, not a storage destination."
                tone="success"
                value={String(snapshot.libraries.length)}
              />
              <StatusRow
                label="Assets reported"
                meta="Assets only appear here after the control plane receives durable ingest state from an authenticated device."
                tone={hasAssets ? 'info' : 'warning'}
                value={String(assets.length)}
              />
              <StatusRow
                label="Verified placements"
                meta="Verification stays explicit. Presence alone is not treated as archive safety."
                tone={verifiedPlacementCount > 0 ? 'info' : 'warning'}
                value={String(verifiedPlacementCount)}
              />
              <StatusRow
                label="Safe-archived assets"
                meta="This means verified primary plus verified replica. It still does not auto-enable cleanup."
                tone={safeArchivedAssets > 0 ? 'success' : 'warning'}
                value={String(safeArchivedAssets)}
              />
              <StatusRow
                label="Pending archive follow-up"
                meta="Assets here still need verification, replica completion, or other durable archive work."
                tone={pendingArchiveAssets > 0 ? 'warning' : 'success'}
                value={String(pendingArchiveAssets)}
              />
              <StatusRow
                label="Blob inventory"
                meta="One logical asset may have multiple blobs, such as a Live Photo pair."
                tone={blobCount > 0 ? 'info' : 'neutral'}
                value={String(blobCount)}
              />
            </div>
          </Card>
        </section>
      ) : (
        <EmptyState
          actionLabel="Start onboarding"
          description="A library is the first archive context. Without it, devices, storage targets, jobs, and restore drills have nowhere trustworthy to attach."
          icon="◍"
          onAction={() => router.push('/onboarding')}
          secondary={`Health API remains available at ${apiBaseUrl}/health/live while the archive is still uninitialized.`}
          title="No libraries registered"
        />
      )}
    </AppShell>
  )
}

function describeLifecycle(lifecycleState: Asset['lifecycleState']) {
  return lifecycleState.replaceAll('_', ' ')
}

function assetTone(lifecycleState: Asset['lifecycleState']) {
  switch (lifecycleState) {
    case 'safe_archived':
      return 'success'
    case 'archived_replica_verified':
    case 'archived_primary_verified':
      return 'info'
    case 'archived_replica_pending_verify':
    case 'archived_primary_pending_verify':
    case 'ingested':
    case 'hashed':
    case 'normalized':
      return 'warning'
    default:
      return 'neutral'
  }
}
