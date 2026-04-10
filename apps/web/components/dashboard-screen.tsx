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
import { useRouter } from 'next/navigation'

const navItems = [
  { label: 'Overview', hint: 'Health, action items, and safe-next steps.', active: true },
  { label: 'Libraries', hint: 'Archive truth and lifecycle status.' },
  { label: 'Devices', hint: 'Desktop agents and ingest endpoints.' },
  { label: 'Storage', hint: 'Primary, replica, preview, and transfer roles.' },
  { label: 'Jobs', hint: 'Explicit orchestration state and operator review.' },
  { label: 'Cleanup', hint: 'Safe review before any removal action.' },
  { label: 'Billing', hint: 'Stripe-hosted subscription surfaces.' },
]

export function DashboardScreen({
  snapshot,
  authEnabled,
  apiBaseUrl,
  usingFallback,
}: {
  snapshot: DashboardSnapshot
  authEnabled: boolean
  apiBaseUrl: string
  usingFallback: boolean
}) {
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const hasStorageTargets = snapshot.storageTargets.length > 0
  const hasDevices = snapshot.devices.length > 0
  const requiresOnboarding = snapshot.libraries.length === 0 || !hasDevices || !hasStorageTargets
  const hasReplicaWarning = snapshot.storageTargets.some(
    (target) => target.role === 'archive-replica' && !target.healthy,
  )

  return (
    <AppShell
      actions={
        <>
          {requiresOnboarding ? (
            <Button onClick={() => router.push('/onboarding')}>Begin onboarding</Button>
          ) : (
            <>
              <Button onClick={() => router.push('/jobs')} variant="secondary">
                Review job queue
              </Button>
              <Button onClick={() => router.push('/onboarding')}>Enroll another device</Button>
              <Button onClick={() => router.push('/onboarding')} variant="secondary">
                Add storage target
              </Button>
            </>
          )}
          <Button variant="ghost">Review cleanup blockers</Button>
        </>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={navItems}
      summary="Calm control plane for archive truth, device health, and cleanup safety. This shell never treats upload completion as archival safety."
      title="Life-Loop"
    >
      {usingFallback ? (
        <Banner
          description="The control plane summary could not be loaded from the API. The shell is showing a conservative fallback state instead of implying healthy archive progress."
          title="Control plane summary unavailable"
          tone="danger"
        />
      ) : null}

      {!authEnabled ? (
        <Banner
          action={<Button variant="secondary">Configure Clerk</Button>}
          description="Local bootstrap runs without Clerk keys, but production auth remains Clerk-only per ADR-006."
          title="Authentication is not configured in this environment"
          tone="warning"
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        {hasReplicaWarning ? (
          <TransitionState
            description="At least one replica target is currently unavailable. The UI keeps archival safety conservative until replica policy is satisfied."
            details={
              <ul className="grid gap-2">
                {snapshot.storageTargets
                  .filter((target) => target.role === 'archive-replica')
                  .map((target) => (
                    <li key={target.id}>
                      {target.name}: {target.healthState}
                    </li>
                  ))}
              </ul>
            }
            nextAction="Reconnect the replica target or adjust policy after review."
            safeNow="Cleanup should remain blocked unless verified placement policy is satisfied."
            state="partial-success"
            title="Replica target requires attention"
          />
        ) : hasStorageTargets ? (
          <TransitionState
            description="Storage targets are registered in the control plane. The next milestone is verifying real placements and surfacing cleanup eligibility from durable state."
            nextAction="Register a device and begin ingest validation against the archive-primary target."
            safeNow="No automatic deletion is enabled, and safety remains policy-driven."
            state="success"
            title="Control plane topology loaded"
          />
        ) : (
          <TransitionState
            description="No storage targets are configured yet, so the archive truth model cannot progress beyond bootstrap."
            nextAction="Add an archive-primary target before enabling ingest."
            safeNow="Nothing has been deleted, and no asset can be marked safe to remove."
            state="blocking-error"
            title="Archive primary target required"
          />
        )}
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
        {!hasDevices ? (
          <EmptyState
            actionLabel="Connect desktop agent"
            description="No active desktop agents are reporting yet. A local execution agent is required before Life-Loop can archive originals to user-controlled storage."
            icon="▣"
            secondary="The control plane tracks health and policy. The agent owns local file placement and verification."
            title="No devices connected"
          />
        ) : (
          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                Devices
              </p>
              <h2 className="text-xl font-semibold text-foreground">Recent device activity</h2>
            </div>
            <div className="divide-y divide-border">
              {snapshot.devices.map((device) => (
                <StatusRow
                  key={device.id}
                  label={device.name}
                  meta={`${device.platform} • ${device.lastSeenAt ?? 'no heartbeat yet'}`}
                  tone={device.status === 'active' ? 'success' : 'warning'}
                  value={device.status}
                />
              ))}
            </div>
          </Card>
        )}
        <TransitionState
          description={
            snapshot.jobs.length > 0
              ? 'Recent control-plane jobs are loaded from Postgres. The next step is to connect job state to real ingest, placement, and verification transitions.'
              : 'The job model exists and the state vocabulary is explicit, but work has not started yet in this environment.'
          }
          nextAction={
            snapshot.jobs.length > 0
              ? 'Inspect the job queue and keep explicit status transitions visible to operators.'
              : 'Start the API and desktop agent, then register the first library.'
          }
          progress={reducedMotion ? 100 : 68}
          safeNow="No cleanup is enabled and no originals are removed automatically."
          state="in-progress"
          title="Bootstrap in progress"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        {hasStorageTargets ? (
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
        ) : (
          <EmptyState
            actionLabel="Add storage target"
            description="Archive-primary, replica, preview, and transfer-cache roles stay explicit. No target is configured yet, so the system cannot treat any upload as safely archived."
            icon="◌"
            secondary="The VPS remains a control plane, not the universal archive for originals."
            title="No storage targets configured"
          />
        )}

        <div className="grid gap-4">
          <TransitionState
            description={
              snapshot.libraries.length > 0
                ? 'Library records are loading from the API. This is now a real control-plane summary rather than a static page-level bootstrap object.'
                : 'The control plane is responding, but no libraries have been registered yet.'
            }
            nextAction={
              snapshot.libraries.length > 0
                ? 'Use onboarding for registry setup and jobs for explicit orchestration state.'
                : 'Register the first library and pair it with an archive-primary target.'
            }
            safeNow="State language stays stable across all trust-critical screens."
            state={snapshot.libraries.length > 0 ? 'success' : 'empty'}
            title={
              snapshot.libraries.length > 0
                ? 'Live control-plane summary'
                : 'No libraries registered'
            }
          />
          <TransitionState
            description="Blocking and dependency-loss states remain explicit and calm. The UI names what is blocked, what remains safe, and what the operator can do now."
            nextAction="Keep wiring these surfaces to real ingest, verification, restore, and cleanup jobs."
            safeNow="Nothing has been deleted, and no asset is marked cleanup-eligible."
            state={usingFallback ? 'disconnected-dependency' : 'completed-with-warnings'}
            title={usingFallback ? 'API dependency unavailable' : 'Transition coverage in place'}
          />
        </div>
      </section>
    </AppShell>
  )
}
