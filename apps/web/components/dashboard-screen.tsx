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
import { useReducedMotion } from 'motion/react'

const navItems = [
  { label: 'Overview', hint: 'Health, action items, and safe-next steps.', active: true },
  { label: 'Libraries', hint: 'Archive truth and lifecycle status.' },
  { label: 'Devices', hint: 'Desktop agents and ingest endpoints.' },
  { label: 'Storage', hint: 'Primary, replica, preview, and transfer roles.' },
  { label: 'Cleanup', hint: 'Safe review before any removal action.' },
  { label: 'Billing', hint: 'Stripe-hosted subscription surfaces.' },
]

export function DashboardScreen({
  snapshot,
  authEnabled,
  apiBaseUrl,
}: {
  snapshot: DashboardSnapshot
  authEnabled: boolean
  apiBaseUrl: string
}) {
  const reducedMotion = useReducedMotion()

  return (
    <AppShell
      actions={
        <>
          <Button>Register device</Button>
          <Button variant="secondary">Add storage target</Button>
          <Button variant="ghost">Review cleanup blockers</Button>
        </>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={navItems}
      summary="Calm control plane for archive truth, device health, and cleanup safety. This shell never treats upload completion as archival safety."
      title="Life-Loop"
    >
      {!authEnabled ? (
        <Banner
          action={<Button variant="secondary">Configure Clerk</Button>}
          description="Local bootstrap runs without Clerk keys, but production auth remains Clerk-only per ADR-006."
          title="Authentication is not configured in this environment"
          tone="warning"
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <TransitionState
          description="Primary archive verification is complete, but one replica target is offline. The system must not imply cleanup safety until replica policy is met."
          details={
            <ul className="grid gap-2">
              <li>Uploaded to staging: complete</li>
              <li>Archived on primary target: verified</li>
              <li>Replica target: unavailable</li>
              <li>Safe to delete from phone: no</li>
            </ul>
          }
          nextAction="Reconnect the replica target or adjust policy after review."
          safeNow="Originals remain safe on the verified primary archive. Cleanup stays blocked."
          state="partial-success"
          title="Replica target unavailable"
        />
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              System health
            </p>
            <h2 className="text-2xl font-semibold text-foreground">Operator summary</h2>
          </div>
          <div className="divide-y divide-border">
            <StatusRow
              label="API readiness"
              meta={`Health endpoints available at ${apiBaseUrl}/health/live and ${apiBaseUrl}/health/ready`}
              tone={snapshot.health.api === 'healthy' ? 'success' : 'warning'}
              value={snapshot.health.api}
            />
            <StatusRow
              label="Database"
              meta="Postgres is the control-plane source of truth for jobs, assets, devices, and audit state."
              tone={snapshot.health.database === 'healthy' ? 'success' : 'warning'}
              value={snapshot.health.database}
            />
            <StatusRow
              label="Restore drills"
              meta="Monthly restore validation is part of the MVP definition of done."
              tone={snapshot.health.restoreDrills === 'passing' ? 'success' : 'warning'}
              value={snapshot.health.restoreDrills}
            />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <EmptyState
          actionLabel="Connect desktop agent"
          description="No active desktop agents are reporting yet. A local execution agent is required before Life-Loop can archive originals to user-controlled storage."
          icon="▣"
          secondary="The control plane tracks health and policy. The agent owns local file placement and verification."
          title="No devices connected"
        />
        <TransitionState
          description="The archive queue exists and the state model is explicit, but work has not started yet in this environment."
          nextAction="Start the API and desktop agent, then register the first library."
          progress={reducedMotion ? 100 : 68}
          safeNow="No cleanup is enabled and no originals are removed automatically."
          state="in-progress"
          title="Bootstrap in progress"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Storage topology
            </p>
            <h2 className="text-xl font-semibold text-foreground">Role-aware targets</h2>
          </div>
          <div className="divide-y divide-border">
            {snapshot.storageTargets.map((target) => (
              <StatusRow
                key={target.id}
                label={target.name}
                meta={`${target.provider} • ${target.role} • ${
                  target.writable ? 'writable' : 'read-only'
                }`}
                tone={target.healthy ? 'success' : 'warning'}
                value={target.healthState}
              />
            ))}
          </div>
        </Card>

        <div className="grid gap-4">
          <TransitionState
            description="Readiness checks must preserve clarity under failure and reduced motion. This component family covers loading, empty, recoverable, blocking, and dependency-loss states."
            nextAction="Reuse the same state surfaces for onboarding, storage health, ingest, cleanup, and restore."
            safeNow="State language stays stable across all trust-critical screens."
            state="empty"
            title="Transition-state system scaffolded"
          />
          <TransitionState
            description="Blocking errors remain explicit and calm. The UI names what is blocked, what remains safe, and what the operator can do now."
            nextAction="Add a writable archive-primary target before enabling ingest."
            safeNow="Nothing has been deleted, and no asset is marked cleanup-eligible."
            state="blocking-error"
            title="Archive primary target required"
          />
        </div>
      </section>
    </AppShell>
  )
}
