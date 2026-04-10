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

export function LibraryScreen({
  apiBaseUrl,
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
  const hasLibraries = snapshot.libraries.length > 0

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
      {usingFallback ? (
        <Banner
          description="The control plane summary is unavailable, so this screen is showing a conservative fallback instead of inferred library state."
          title="Library state unavailable"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={
          hasLibraries
            ? 'Library records are loaded from the control plane. Asset inventory is still shallow because ingest and placement execution are not wired yet.'
            : 'No libraries exist yet, so there is no archive context to reason about.'
        }
        nextAction={
          hasLibraries
            ? 'Open onboarding to add another library or continue device and storage setup.'
            : 'Create the first library to anchor archive truth.'
        }
        safeNow="No asset is being treated as archived, verified, or cleanup-ready on this screen."
        state={hasLibraries ? 'success' : 'empty'}
        title={hasLibraries ? 'Library context available' : 'No library context yet'}
      />

      {hasLibraries ? (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                Libraries
              </p>
              <h2 className="text-xl font-semibold text-foreground">Registered archive contexts</h2>
            </div>
            <div className="divide-y divide-border">
              {snapshot.libraries.map((library) => (
                <StatusRow
                  key={library.id}
                  label={library.name}
                  meta={`${library.slug} • ${library.description ?? 'No description yet'}`}
                  tone="info"
                  value={`${library.assetCount} assets`}
                />
              ))}
            </div>
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
                label="Device count"
                meta="Device trust and ingest responsibility are separate from library definition."
                tone={snapshot.devices.length > 0 ? 'info' : 'warning'}
                value={String(snapshot.devices.length)}
              />
              <StatusRow
                label="Storage target count"
                meta="Storage still determines where data lives; libraries only anchor control-plane truth."
                tone={snapshot.storageTargets.length > 0 ? 'info' : 'warning'}
                value={String(snapshot.storageTargets.length)}
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
