'use client'

import type {
  DashboardSnapshot,
  RestoreDrillDetail,
  RestoreReadiness,
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
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { buildPrimaryNavItems } from './primary-nav'

export function RestoreScreen({
  apiBaseUrl,
  authEnabled,
  readiness,
  restoreDrillDetails,
  snapshot,
  usingDrillDetailsFallback,
  usingReadinessFallback,
  usingSnapshotFallback,
}: {
  apiBaseUrl: string
  authEnabled: boolean
  readiness: RestoreReadiness
  restoreDrillDetails: RestoreDrillDetail[]
  snapshot: DashboardSnapshot
  usingDrillDetailsFallback: boolean
  usingReadinessFallback: boolean
  usingSnapshotFallback: boolean
}) {
  const router = useRouter()
  const hasRestoreDrills = snapshot.restoreDrills.length > 0
  const failedDrill = snapshot.restoreDrills.find((drill) => drill.status === 'failed')
  const hasCandidates = readiness.candidates.length > 0

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
      {usingSnapshotFallback || usingReadinessFallback || usingDrillDetailsFallback ? (
        <Banner
          description="Some restore data could not be loaded, so this screen stays conservative about restore confidence."
          title="Restore state unavailable"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={
          failedDrill
            ? 'At least one restore drill failed and needs review before confidence can improve.'
            : readiness.summary.readyCount > 0
              ? 'Verified restore paths exist for part of the library, but restore execution still remains explicit.'
              : hasRestoreDrills
                ? 'Restore drill history exists, but verified per-asset restore coverage is still incomplete.'
                : 'No restore drill history exists yet.'
        }
        nextAction={
          readiness.summary.degradedCount > 0 || readiness.summary.blockedCount > 0
            ? 'Review degraded restore candidates before assuming the archive is recoverable.'
            : hasRestoreDrills
              ? 'Review recent restore-drill outcomes and queue the next explicit verification run.'
              : 'Use Activity to queue the first restore-drill job.'
        }
        safeNow="No screen here claims restore readiness without recorded drill state."
        state={
          failedDrill
            ? 'recoverable-error'
            : readiness.summary.readyCount > 0 || hasRestoreDrills
              ? 'completed-with-warnings'
              : 'empty'
        }
        title={
          failedDrill
            ? 'Restore drill failed'
            : readiness.summary.readyCount > 0 || hasRestoreDrills
              ? 'Restore evidence exists'
              : 'No restore evidence yet'
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Readiness
            </p>
            <h2 className="text-xl font-semibold text-foreground">Restore candidates</h2>
          </div>
          {hasCandidates ? (
            <div className="divide-y divide-border">
              {readiness.candidates.map((candidate) => (
                <div
                  key={candidate.assetId}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{candidate.filename}</p>
                    <p className="text-sm text-[hsl(var(--color-text-secondary))]">
                      {candidate.restoreSource ?? 'No restore source recorded'} •{' '}
                      {candidate.restoreScope}
                    </p>
                    <p className="text-sm text-[hsl(var(--color-text-secondary))]">
                      {candidate.expectedResult}
                    </p>
                    {candidate.warning ? (
                      <p className="text-sm text-[hsl(var(--color-warning))]">
                        {candidate.warning}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={candidateBadgeClassName(candidate.restoreStatus)}>
                      {candidate.restoreStatus}
                    </span>
                    <Link
                      className="text-sm font-medium text-[hsl(var(--color-primary))] underline-offset-4 hover:underline"
                      href={`/library/${candidate.assetId}`}
                    >
                      View asset
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              actionLabel="Open library"
              description="No asset-level restore candidates are recorded yet."
              icon="↺"
              onAction={() => router.push('/library')}
              secondary={`Restore readiness will appear here after ingest reports create original placements in ${apiBaseUrl}.`}
              title="No restore candidates yet"
            />
          )}
        </Card>

        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Summary
            </p>
            <h2 className="text-xl font-semibold text-foreground">Restore posture</h2>
          </div>
          <div className="divide-y divide-border">
            <StatusRow
              label="Ready candidates"
              meta="Assets with at least one verified healthy restore placement."
              tone={readiness.summary.readyCount > 0 ? 'success' : 'neutral'}
              value={String(readiness.summary.readyCount)}
            />
            <StatusRow
              label="Degraded candidates"
              meta="Assets with a recorded restore path that still needs verification or review."
              tone={readiness.summary.degradedCount > 0 ? 'warning' : 'neutral'}
              value={String(readiness.summary.degradedCount)}
            />
            <StatusRow
              label="Blocked candidates"
              meta="Assets missing a restorable original placement record."
              tone={readiness.summary.blockedCount > 0 ? 'danger' : 'neutral'}
              value={String(readiness.summary.blockedCount)}
            />
            <StatusRow
              label="Recent drill status"
              meta="Restore drills remain a separate confidence signal from per-asset placement readiness."
              tone={failedDrill ? 'danger' : hasRestoreDrills ? 'info' : 'warning'}
              value={
                failedDrill
                  ? 'failed'
                  : hasRestoreDrills
                    ? (snapshot.restoreDrills[0]?.status ?? 'none')
                    : 'none'
              }
            />
          </div>
        </Card>
      </section>

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
      ) : null}

      {restoreDrillDetails.length > 0 ? (
        <section className="grid gap-4">
          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                Evidence
              </p>
              <h2 className="text-xl font-semibold text-foreground">Restore evidence</h2>
            </div>
            <div className="divide-y divide-border">
              {restoreDrillDetails.map((detail) => {
                const verifiedCount = detail.evidence.filter(
                  (evidence) => evidence.evidenceStatus === 'verified',
                ).length
                const blockedCount = detail.evidence.filter(
                  (evidence) =>
                    evidence.evidenceStatus === 'blocked' || evidence.evidenceStatus === 'failed',
                ).length

                return (
                  <StatusRow
                    key={detail.drill.id}
                    label={detail.drill.libraryId}
                    meta={`${verifiedCount}/${detail.drill.sampleSize} verified • ${blockedCount} blocked/failed • ${detail.drill.notes ?? 'no notes'}`}
                    tone={
                      detail.drill.status === 'passed'
                        ? 'success'
                        : detail.drill.status === 'failed'
                          ? 'danger'
                          : detail.evidence.length > 0
                            ? 'info'
                            : 'warning'
                    }
                    value={detail.drill.status}
                  />
                )
              })}
            </div>
          </Card>
        </section>
      ) : null}
    </AppShell>
  )
}

function candidateBadgeClassName(status: RestoreReadiness['candidates'][number]['restoreStatus']) {
  switch (status) {
    case 'ready':
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-success)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-success))]'
    case 'degraded':
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-warning)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-warning))]'
    default:
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-danger)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-danger))]'
  }
}
