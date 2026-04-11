'use client'

import type {
  CleanupCandidate,
  CleanupReviewReadiness,
  DashboardSnapshot,
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
import { useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { buildPrimaryNavItems } from './primary-nav'

export function CleanupScreen({
  apiBaseUrl,
  authEnabled,
  cleanupReadiness,
  snapshot,
  usingCleanupFallback,
  usingSnapshotFallback,
}: {
  apiBaseUrl: string
  authEnabled: boolean
  cleanupReadiness: CleanupReviewReadiness
  snapshot: DashboardSnapshot
  usingCleanupFallback: boolean
  usingSnapshotFallback: boolean
}) {
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const hasCandidates = cleanupReadiness.candidates.length > 0
  const hasEligibleForReview = cleanupReadiness.summary.eligibleForReviewCount > 0
  const hasBlocked = cleanupReadiness.summary.blockedCount > 0
  const hasManualReview = cleanupReadiness.summary.manualReviewCount > 0

  return (
    <AppShell
      actions={
        <>
          <Button onClick={() => router.push('/activity')}>Review cleanup jobs</Button>
          <Button onClick={() => router.push('/restore')} variant="secondary">
            Review restore evidence
          </Button>
        </>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Cleanup')}
      summary="Cleanup is manual-only in MVP. This screen explains blockers and never treats upload or archive job success as permission to delete."
      title="Cleanup Review"
    >
      {usingSnapshotFallback || usingCleanupFallback ? (
        <Banner
          description="Cleanup readiness could not be fully loaded, so the UI stays blocked and does not imply any item can be removed."
          title="Cleanup state unavailable"
          tone="warning"
        />
      ) : null}

      <Banner
        description="No automatic phone cleanup or archive deletion is available in this MVP. Eligible items still require an explicit human review outside this control-plane projection."
        title="Deletion remains disabled"
        tone="info"
      />

      <TransitionState
        description={
          hasEligibleForReview
            ? 'Some assets have verified primary placement, verified replica placement, and passed restore-drill evidence, so they can enter manual cleanup review.'
            : hasManualReview
              ? 'At least one asset is already in a manual review lifecycle state. Deletion remains disabled until policy and operator review are explicit.'
              : hasBlocked
                ? 'Cleanup remains blocked because one or more required evidence signals are missing.'
                : 'No assets are available for cleanup review yet.'
        }
        nextAction={
          hasBlocked
            ? 'Resolve the listed archive and restore evidence blockers before reviewing cleanup.'
            : hasEligibleForReview || hasManualReview
              ? 'Review candidates manually and keep delete operations outside the MVP control plane.'
              : 'Ingest assets, verify primary and replica placement, then run restore drills.'
        }
        progress={reducedMotion ? 100 : cleanupProgress(cleanupReadiness)}
        safeNow="Nothing is deleted automatically, upload success alone is not enough, and cleanup is blocked without verified primary, replica, and asset-level restore evidence."
        state={
          usingCleanupFallback || hasBlocked
            ? 'blocking-error'
            : hasEligibleForReview || hasManualReview
              ? 'completed-with-warnings'
              : 'empty'
        }
        title={
          hasEligibleForReview
            ? 'Manual cleanup review available'
            : hasBlocked
              ? 'Cleanup remains blocked'
              : 'No cleanup candidates yet'
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Candidates
            </p>
            <h2 className="text-xl font-semibold text-foreground">Manual cleanup readiness</h2>
          </div>

          {hasCandidates ? (
            <div className="divide-y divide-border">
              {cleanupReadiness.candidates.map((candidate) => (
                <CleanupCandidateRow candidate={candidate} key={candidate.assetId} />
              ))}
            </div>
          ) : (
            <EmptyState
              actionLabel="Open library"
              description="No asset-level cleanup candidates are recorded yet."
              icon="◒"
              onAction={() => router.push('/library')}
              secondary={`Cleanup review data is loaded from ${apiBaseUrl}/v1/cleanup/review and stays blocked when the API is unavailable.`}
              title="No cleanup candidates"
            />
          )}
        </Card>

        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Policy
            </p>
            <h2 className="text-xl font-semibold text-foreground">Cleanup safety gates</h2>
          </div>
          <div className="divide-y divide-border">
            <StatusRow
              label="Eligible for manual review"
              meta="Has verified archive-primary, verified archive-replica, and asset-level restore evidence from a passed drill."
              tone={cleanupReadiness.summary.eligibleForReviewCount > 0 ? 'warning' : 'neutral'}
              value={String(cleanupReadiness.summary.eligibleForReviewCount)}
            />
            <StatusRow
              label="Blocked"
              meta="Missing at least one required archive or restore evidence signal."
              tone={cleanupReadiness.summary.blockedCount > 0 ? 'danger' : 'neutral'}
              value={String(cleanupReadiness.summary.blockedCount)}
            />
            <StatusRow
              label="Manual review lifecycle"
              meta="Needs operator review; this screen still exposes no deletion action."
              tone={cleanupReadiness.summary.manualReviewCount > 0 ? 'warning' : 'neutral'}
              value={String(cleanupReadiness.summary.manualReviewCount)}
            />
            <StatusRow
              label="Libraries in scope"
              meta="Cleanup review is derived from control-plane metadata, not billing state or upload success."
              tone={snapshot.libraries.length > 0 ? 'info' : 'warning'}
              value={String(snapshot.libraries.length)}
            />
          </div>
        </Card>
      </section>
    </AppShell>
  )
}

function CleanupCandidateRow({ candidate }: { candidate: CleanupCandidate }) {
  const badgeClassName = cleanupBadgeClassName(candidate.cleanupStatus)

  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{candidate.filename}</p>
        <p className="text-sm text-[hsl(var(--color-text-secondary))]">
          {candidate.lifecycleState} • primary {candidate.evidence.verifiedPrimaryCount} • replica{' '}
          {candidate.evidence.verifiedReplicaCount} • asset restore evidence{' '}
          {candidate.evidence.verifiedRestoreEvidenceCount} • latest drill{' '}
          {candidate.evidence.latestRestoreDrillStatus ?? 'missing'}
        </p>
        {candidate.blockers.length > 0 ? (
          <p className="text-sm text-[hsl(var(--color-danger))]">
            Blocked: {candidate.blockers.join('; ')}
          </p>
        ) : (
          <p className="text-sm text-[hsl(var(--color-warning))]">
            Eligible for manual review only. No delete action is enabled.
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className={badgeClassName}>{candidate.cleanupStatus.replaceAll('_', ' ')}</span>
        <Link
          className="text-sm font-medium text-[hsl(var(--color-primary))] underline-offset-4 hover:underline"
          href={`/library/${candidate.assetId}`}
        >
          View asset
        </Link>
      </div>
    </div>
  )
}

function cleanupProgress(readiness: CleanupReviewReadiness) {
  if (readiness.summary.totalCandidates === 0) {
    return 0
  }

  return Math.round(
    ((readiness.summary.eligibleForReviewCount + readiness.summary.manualReviewCount) /
      readiness.summary.totalCandidates) *
      100,
  )
}

function cleanupBadgeClassName(status: CleanupCandidate['cleanupStatus']) {
  switch (status) {
    case 'eligible_for_review':
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-warning)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-warning))]'
    case 'manual_review':
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-info)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-info))]'
    default:
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-danger)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-danger))]'
  }
}
