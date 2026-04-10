'use client'

import type {
  DashboardSnapshot,
  StorageReadiness,
  StorageReadinessTarget,
} from '@life-loop/shared-types'
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

export function StorageScreen({
  apiBaseUrl,
  authEnabled,
  readiness,
  snapshot,
  usingReadinessFallback,
  usingSnapshotFallback,
}: {
  apiBaseUrl: string
  authEnabled: boolean
  readiness: StorageReadiness
  snapshot: DashboardSnapshot
  usingReadinessFallback: boolean
  usingSnapshotFallback: boolean
}) {
  const router = useRouter()
  const hasTargets = readiness.targets.length > 0
  const hasPrimary = readiness.targets.some((target) => target.role === 'archive-primary')
  const hasReplicaWarning = readiness.targets.some((target) => target.connectionState === 'stale')

  return (
    <AppShell
      actions={
        <Button onClick={() => router.push('/onboarding')}>
          {hasTargets ? 'Add storage target' : 'Register first storage target'}
        </Button>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Storage')}
      summary="Storage answers where the data lives. Roles, connection state, and verification backlog stay explicit instead of being flattened into a generic connected state."
      title="Storage"
    >
      {usingReadinessFallback || usingSnapshotFallback ? (
        <Banner
          description="At least one storage dependency could not be loaded, so this screen stays conservative about target health and verification."
          title="Storage state unavailable"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={
          hasReplicaWarning
            ? 'At least one replica target is stale, so archive safety remains conservative until it is reconnected or reverified.'
            : hasPrimary
              ? 'Archive targets exist and verification backlog is visible, but storage telemetry is still intentionally limited.'
              : 'No archive-primary target is configured.'
        }
        nextAction={
          hasReplicaWarning
            ? 'Reconnect or review the stale replica target before treating replicas as current.'
            : hasPrimary
              ? 'Review target readiness and finish outstanding placement verification.'
              : 'Register an archive-primary target before any ingest flow is treated seriously.'
        }
        safeNow="This screen never treats target presence alone as proof of archive safety."
        state={
          hasReplicaWarning
            ? 'partial-success'
            : hasPrimary
              ? 'completed-with-warnings'
              : 'blocking-error'
        }
        title={
          hasReplicaWarning
            ? 'Replica attention required'
            : hasPrimary
              ? 'Storage topology registered'
              : 'Archive primary required'
        }
      />

      {hasTargets ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
            <Card className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                  Readiness
                </p>
                <h2 className="text-xl font-semibold text-foreground">Storage posture</h2>
              </div>
              <div className="divide-y divide-border">
                <StatusRow
                  label="Healthy targets"
                  meta="Targets the control plane can currently treat as healthy."
                  tone={readiness.summary.healthyTargets > 0 ? 'success' : 'neutral'}
                  value={String(readiness.summary.healthyTargets)}
                />
                <StatusRow
                  label="Stale targets"
                  meta="Replica targets that need attention before replicas are treated as current."
                  tone={readiness.summary.staleTargets > 0 ? 'warning' : 'neutral'}
                  value={String(readiness.summary.staleTargets)}
                />
                <StatusRow
                  label="Unavailable targets"
                  meta="Configured targets the control plane cannot currently treat as available."
                  tone={readiness.summary.unavailableTargets > 0 ? 'danger' : 'neutral'}
                  value={String(readiness.summary.unavailableTargets)}
                />
                <StatusRow
                  label="Pending verification placements"
                  meta="Placements that still need verification before they strengthen archive safety."
                  tone={readiness.summary.pendingVerificationPlacements > 0 ? 'warning' : 'success'}
                  value={String(readiness.summary.pendingVerificationPlacements)}
                />
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                  Replica health
                </p>
                <h2 className="text-xl font-semibold text-foreground">What remains safe</h2>
              </div>
              <div className="divide-y divide-border">
                <StatusRow
                  label="Known libraries"
                  meta="Registered library contexts attached to target ownership."
                  tone={snapshot.libraries.length > 0 ? 'info' : 'warning'}
                  value={String(snapshot.libraries.length)}
                />
                <StatusRow
                  label="Configured replica targets"
                  meta="Replica registration exists separately from replica freshness."
                  tone={
                    readiness.targets.some((target) => target.role === 'archive-replica')
                      ? 'info'
                      : 'warning'
                  }
                  value={String(
                    readiness.targets.filter((target) => target.role === 'archive-replica').length,
                  )}
                />
                <StatusRow
                  label="Space pressure telemetry"
                  meta="Capacity tracking is not implemented yet, so this stays explicit instead of guessed."
                  tone="warning"
                  value="unavailable"
                />
              </div>
            </Card>
          </section>

          <section className="grid gap-4">
            {readiness.targets.map((target) => (
              <Card className="space-y-4" key={target.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">{target.name}</h2>
                    <p className="text-sm text-[hsl(var(--color-text-secondary))]">
                      {target.provider} • {target.role}
                    </p>
                  </div>
                  <span className={targetBadgeClassName(target.connectionState)}>
                    {target.connectionState}
                  </span>
                </div>

                {target.warning ? (
                  <Banner
                    description={target.warning}
                    title={
                      target.connectionState === 'stale'
                        ? 'Replica target unavailable'
                        : target.connectionState === 'unavailable'
                          ? 'Target unavailable'
                          : 'Verification still pending'
                    }
                    tone={
                      target.connectionState === 'unavailable'
                        ? 'danger'
                        : target.connectionState === 'stale'
                          ? 'warning'
                          : 'info'
                    }
                  />
                ) : null}

                <div className="divide-y divide-border">
                  <StatusRow
                    label="Connection state"
                    meta="Users must always know the difference between configured, writable, healthy, stale, and unavailable."
                    tone={toneForConnectionState(target.connectionState)}
                    value={target.connectionState}
                  />
                  <StatusRow
                    label="Writable"
                    meta="Write capability matters separately from health state."
                    tone={target.writable ? 'success' : 'warning'}
                    value={target.writable ? 'yes' : 'no'}
                  />
                  <StatusRow
                    label="Verification health"
                    meta={`Verified placements ${target.verifiedPlacementCount}/${target.placementCount}`}
                    tone={
                      target.pendingVerificationCount > 0
                        ? 'warning'
                        : target.verifiedPlacementCount > 0
                          ? 'success'
                          : 'neutral'
                    }
                    value={
                      target.pendingVerificationCount > 0
                        ? 'pending'
                        : target.verifiedPlacementCount > 0
                          ? 'verified'
                          : 'none'
                    }
                  />
                  <StatusRow
                    label="Last verified"
                    meta="Most recent verified placement timestamp recorded on this target."
                    tone={target.lastVerifiedAt ? 'info' : 'warning'}
                    value={target.lastVerifiedAt ?? 'never'}
                  />
                  <StatusRow
                    label="Space pressure"
                    meta="Capacity telemetry is intentionally not inferred until real provider metrics exist."
                    tone="warning"
                    value={target.spacePressure}
                  />
                  <StatusRow
                    label="Target id"
                    meta="Stable control-plane identifier for audit and support trails."
                    tone="neutral"
                    value={target.id}
                  />
                </div>
              </Card>
            ))}
          </section>
        </>
      ) : (
        <EmptyState
          actionLabel="Open onboarding"
          description="Storage targets define where originals, replicas, previews, and transfer data live. Without them, uploads or selections cannot be described as archive-safe."
          icon="◌"
          onAction={() => router.push('/onboarding')}
          secondary={`The VPS remains a control plane and convenience layer, not the universal archive for originals. Register targets through ${apiBaseUrl}/v1/storage-targets.`}
          title="No storage targets configured"
        />
      )}
    </AppShell>
  )
}

function toneForConnectionState(connectionState: StorageReadinessTarget['connectionState']) {
  switch (connectionState) {
    case 'healthy':
      return 'success' as const
    case 'verifying':
    case 'stale':
      return 'warning' as const
    default:
      return 'danger' as const
  }
}

function targetBadgeClassName(connectionState: StorageReadinessTarget['connectionState']) {
  switch (connectionState) {
    case 'healthy':
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-success)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-success))]'
    case 'verifying':
    case 'stale':
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-warning)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-warning))]'
    default:
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-danger)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-danger))]'
  }
}
