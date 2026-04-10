'use client'

import type { DashboardSnapshot } from '@life-loop/shared-types'
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
  authEnabled,
  snapshot,
  usingFallback,
}: {
  apiBaseUrl: string
  authEnabled: boolean
  snapshot: DashboardSnapshot
  usingFallback: boolean
}) {
  const router = useRouter()
  const hasTargets = snapshot.storageTargets.length > 0
  const hasReplicaWarning = snapshot.storageTargets.some(
    (target) => target.role === 'archive-replica' && !target.healthy,
  )
  const hasPrimary = snapshot.storageTargets.some((target) => target.role === 'archive-primary')

  return (
    <AppShell
      actions={
        <Button onClick={() => router.push('/onboarding')}>
          {hasTargets ? 'Add storage target' : 'Register first storage target'}
        </Button>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Storage')}
      summary="Storage answers where the data lives. Roles, availability, and verification health stay visible instead of being flattened into a generic connected state."
      title="Storage"
    >
      {usingFallback ? (
        <Banner
          description="The storage registry could not be loaded. This screen falls back to conservative warnings instead of implying healthy placement state."
          title="Storage state unavailable"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={
          hasReplicaWarning
            ? 'At least one replica target is unhealthy, so archival safety remains conservative.'
            : hasPrimary
              ? 'An archive-primary target exists, but verification and space-pressure telemetry are still shallow.'
              : 'No archive-primary target is configured.'
        }
        nextAction={
          hasPrimary
            ? 'Review target roles and keep verification state explicit as agent plumbing expands.'
            : 'Register an archive-primary target before any ingest flow is treated seriously.'
        }
        safeNow="This screen never treats target presence alone as verified archive safety."
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
        <section className="grid gap-4">
          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                Targets
              </p>
              <h2 className="text-xl font-semibold text-foreground">Role-aware storage registry</h2>
            </div>
            <div className="divide-y divide-border">
              {snapshot.storageTargets.map((target) => (
                <StatusRow
                  key={target.id}
                  label={target.name}
                  meta={`${target.provider} • ${target.role} • ${target.writable ? 'writable' : 'read-only'}`}
                  tone={target.healthy ? 'success' : 'warning'}
                  value={target.healthState}
                />
              ))}
            </div>
          </Card>
        </section>
      ) : (
        <EmptyState
          actionLabel="Open onboarding"
          description="Storage targets define where originals, replicas, previews, and transfer data live. Without them, uploads or selections cannot be described as archive-safe."
          icon="◌"
          onAction={() => router.push('/onboarding')}
          secondary="The VPS remains a control plane and convenience layer, not the universal archive for originals."
          title="No storage targets configured"
        />
      )}
    </AppShell>
  )
}
