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

export function RestoreScreen({
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
  const hasRestoreDrills = snapshot.restoreDrills.length > 0
  const failedDrill = snapshot.restoreDrills.find((drill) => drill.status === 'failed')

  return (
    <AppShell
      actions={
        <Button onClick={() => router.push('/activity')}>
          {hasRestoreDrills ? 'Review restore activity' : 'Queue restore drill'}
        </Button>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Restore')}
      summary="Restore answers what can be recovered and how safely. Drill history stays visible because backup claims without restore evidence are insufficient."
      title="Restore"
    >
      {usingFallback ? (
        <Banner
          description="Restore data could not be loaded, so this screen is refusing to imply that restore readiness is known."
          title="Restore state unavailable"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={
          failedDrill
            ? 'At least one restore drill failed and needs review before confidence can improve.'
            : hasRestoreDrills
              ? 'Restore drill history exists, but full restore execution surfaces are still placeholders.'
              : 'No restore drill history exists yet.'
        }
        nextAction={
          hasRestoreDrills
            ? 'Review recent restore-drill outcomes and queue the next explicit verification run.'
            : 'Use Activity to queue the first restore-drill job.'
        }
        safeNow="No screen here claims restore readiness without recorded drill state."
        state={
          failedDrill ? 'recoverable-error' : hasRestoreDrills ? 'completed-with-warnings' : 'empty'
        }
        title={
          failedDrill
            ? 'Restore drill failed'
            : hasRestoreDrills
              ? 'Restore evidence exists'
              : 'No restore evidence yet'
        }
      />

      {hasRestoreDrills ? (
        <section className="grid gap-4">
          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                Drill history
              </p>
              <h2 className="text-xl font-semibold text-foreground">Recent restore drills</h2>
            </div>
            <div className="divide-y divide-border">
              {snapshot.restoreDrills.map((drill) => (
                <StatusRow
                  key={drill.id}
                  label={drill.libraryId}
                  meta={`sample ${drill.sampleSize} • ${drill.startedAt ?? 'not started'} • ${drill.notes ?? 'no notes'}`}
                  tone={
                    drill.status === 'passed'
                      ? 'success'
                      : drill.status === 'running'
                        ? 'info'
                        : drill.status === 'failed'
                          ? 'danger'
                          : 'warning'
                  }
                  value={drill.status}
                />
              ))}
            </div>
          </Card>
        </section>
      ) : (
        <EmptyState
          actionLabel="Open activity"
          description="Restore evidence is still empty. Queue a restore-drill to start proving that the archive can be recovered, not just stored."
          icon="↺"
          onAction={() => router.push('/activity')}
          secondary="This remains a placeholder for restore execution, but drill history is already a required MVP signal."
          title="No restore drills yet"
        />
      )}
    </AppShell>
  )
}
