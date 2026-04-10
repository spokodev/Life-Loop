'use client'

import type { Asset, AssetDetail, DashboardSnapshot } from '@life-loop/shared-types'
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

export function AssetDetailScreen({
  apiBaseUrl,
  assetDetail,
  authEnabled,
  detailNotFound,
  snapshot,
  usingDetailFallback,
  usingSnapshotFallback,
}: {
  apiBaseUrl: string
  assetDetail: AssetDetail | null
  authEnabled: boolean
  detailNotFound: boolean
  snapshot: DashboardSnapshot
  usingDetailFallback: boolean
  usingSnapshotFallback: boolean
}) {
  const router = useRouter()

  if (detailNotFound) {
    return (
      <AppShell
        actions={<Button onClick={() => router.push('/library')}>Back to library</Button>}
        eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
        navItems={buildPrimaryNavItems('Library')}
        summary="Asset detail shows recoverable item state without overstating archive safety."
        title="Asset detail"
      >
        <EmptyState
          actionLabel="Return to library"
          description="This asset detail record no longer exists in the control plane."
          icon="◍"
          onAction={() => router.push('/library')}
          secondary={`Library inventory remains available at ${apiBaseUrl}/v1/assets.`}
          title="Asset not found"
        />
      </AppShell>
    )
  }

  if (!assetDetail) {
    return (
      <AppShell
        actions={<Button onClick={() => router.push('/library')}>Back to library</Button>}
        eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
        navItems={buildPrimaryNavItems('Library')}
        summary="Asset detail shows recoverable item state without overstating archive safety."
        title="Asset detail"
      >
        <TransitionState
          description="The control plane asset detail could not be loaded."
          nextAction="Retry from the library list once the API is reachable again."
          safeNow="No new archive claims are made while detail data is unavailable."
          state="recoverable-error"
          title="Asset detail unavailable"
        />
      </AppShell>
    )
  }

  const asset = assetDetail.asset
  const state = lifecycleToTransitionState(asset.lifecycleState)

  return (
    <AppShell
      actions={<Button onClick={() => router.push('/library')}>Back to library</Button>}
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Library')}
      summary="Asset detail shows recoverable item state without overstating archive safety."
      title={asset.filename}
    >
      {usingSnapshotFallback || usingDetailFallback ? (
        <Banner
          description="Some control-plane detail is unavailable, so this screen is intentionally conservative."
          title="Partial asset detail available"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={describeAssetLifecycle(asset.lifecycleState)}
        nextAction={describeAssetNextAction(asset.lifecycleState)}
        safeNow={describeAssetSafeNow(asset.lifecycleState)}
        state={state}
        title={describeAssetTitle(asset.lifecycleState)}
      />

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Placements
            </p>
            <h2 className="text-xl font-semibold text-foreground">Where this asset lives</h2>
          </div>
          <div className="divide-y divide-border">
            {assetDetail.placements.map((placement) => (
              <StatusRow
                key={placement.id}
                label={placement.storageTargetName}
                meta={`${placement.role} • ${placement.storageTargetProvider} • ${placement.blobKind} • ${placement.storageTargetWritable ? 'writable' : 'read-only'}`}
                tone={
                  placement.verifiedAt
                    ? 'success'
                    : placement.healthState === 'verifying'
                      ? 'warning'
                      : 'info'
                }
                value={placement.verifiedAt ? 'verified' : placement.healthState}
              />
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Blob detail
            </p>
            <h2 className="text-xl font-semibold text-foreground">What was recorded</h2>
          </div>
          <div className="divide-y divide-border">
            {assetDetail.blobs.map((blob) => (
              <StatusRow
                key={blob.id}
                label={blob.kind}
                meta={`${blob.mimeType ?? 'unknown mime'} • ${formatBytes(blob.sizeBytes)} • ${blob.checksumSha256.slice(0, 12)}…`}
                tone="info"
                value="recorded"
              />
            ))}
            <StatusRow
              label="Library"
              meta="The control plane library namespace this asset belongs to."
              tone="neutral"
              value={String(
                snapshot.libraries.find((library) => library.id === asset.libraryId)?.name ??
                  'Unknown',
              )}
            />
            <StatusRow
              label="Verified placements"
              meta="Only verified placements count toward durable archive safety."
              tone={asset.verifiedPlacementCount > 0 ? 'info' : 'warning'}
              value={`${asset.verifiedPlacementCount}/${asset.placementCount}`}
            />
          </div>
        </Card>
      </section>
    </AppShell>
  )
}

function lifecycleToTransitionState(lifecycleState: Asset['lifecycleState']) {
  switch (lifecycleState) {
    case 'safe_archived':
      return 'success'
    case 'archived_replica_verified':
    case 'archived_primary_verified':
      return 'partial-success'
    case 'archived_replica_pending_verify':
    case 'archived_primary_pending_verify':
      return 'completed-with-warnings'
    case 'manual_review':
      return 'blocking-error'
    default:
      return 'in-progress'
  }
}

function describeAssetTitle(lifecycleState: Asset['lifecycleState']) {
  switch (lifecycleState) {
    case 'safe_archived':
      return 'Durably archived'
    case 'archived_replica_verified':
    case 'archived_primary_verified':
      return 'Partially verified'
    case 'archived_replica_pending_verify':
    case 'archived_primary_pending_verify':
      return 'Archive follow-up required'
    case 'manual_review':
      return 'Needs review'
    default:
      return 'Archive work in progress'
  }
}

function describeAssetLifecycle(lifecycleState: Asset['lifecycleState']) {
  switch (lifecycleState) {
    case 'safe_archived':
      return 'Primary and replica placements are both verified for this asset.'
    case 'archived_replica_verified':
      return 'Replica verification exists, but the overall safety model is still not at final safe-archived state.'
    case 'archived_primary_verified':
      return 'Primary archive verification succeeded, but replica coverage is still incomplete.'
    case 'archived_replica_pending_verify':
      return 'Replica placement exists but still needs verification before the archive can be treated as durable.'
    case 'archived_primary_pending_verify':
      return 'Primary placement exists but still needs verification.'
    case 'manual_review':
      return 'The archive pipeline flagged this asset for manual review.'
    default:
      return 'This asset has been reported to the control plane, but durable archive work is still progressing.'
  }
}

function describeAssetSafeNow(lifecycleState: Asset['lifecycleState']) {
  switch (lifecycleState) {
    case 'safe_archived':
      return 'This asset is recorded as safe-archived, but cleanup remains a separate policy step.'
    case 'archived_replica_verified':
    case 'archived_primary_verified':
      return 'Some verified coverage exists, but this asset should not yet be treated as fully safe-archived.'
    default:
      return 'Do not treat this asset as durably safe until the missing verification or replica work is complete.'
  }
}

function describeAssetNextAction(lifecycleState: Asset['lifecycleState']) {
  switch (lifecycleState) {
    case 'safe_archived':
      return 'Continue ingest, review activity history, or inspect restore readiness.'
    case 'archived_replica_verified':
    case 'archived_primary_verified':
      return 'Complete the remaining placement verification or replica work.'
    case 'archived_replica_pending_verify':
      return 'Verify the replica placement before treating the archive as durable.'
    case 'archived_primary_pending_verify':
      return 'Verify the primary placement before relying on this archive record.'
    case 'manual_review':
      return 'Inspect the placement and blob records before retrying archive work.'
    default:
      return 'Wait for the next explicit archive state update from the agent.'
  }
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
