'use client'

import type { DashboardSnapshot } from '@life-loop/shared-types'
import { AppShell, Banner, Button, Card, StatusRow, TransitionState } from '@life-loop/ui'
import { useRouter } from 'next/navigation'

import { buildPrimaryNavItems } from './primary-nav'

export function SettingsScreen({
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

  return (
    <AppShell
      actions={<Button onClick={() => router.push('/activity')}>Review limits and activity</Button>}
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Settings')}
      summary="Settings answer what policies apply. Billing and limits stay separate from archive health, even while backend policy surfaces are still placeholders."
      title="Settings"
    >
      {usingFallback ? (
        <Banner
          description="Settings is using conservative fallback data because the control-plane summary could not be loaded."
          title="Settings data unavailable"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description="Policy surfaces are intentionally shallow in this MVP foundation. The screen makes placeholders explicit instead of pretending policy engines or billing enforcement already exist."
        nextAction="Keep policy and billing surfaces explicit while Stripe and auth integrations deepen."
        safeNow="Archive health is not being mixed with pricing, cleanup policy, or account administration."
        state="completed-with-warnings"
        title="Settings placeholders in place"
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Context
            </p>
            <h2 className="text-xl font-semibold text-foreground">Environment and auth</h2>
          </div>
          <div className="divide-y divide-border">
            <StatusRow
              label="Auth mode"
              meta="Clerk remains the documented production auth provider."
              tone={authEnabled ? 'success' : 'warning'}
              value={authEnabled ? 'configured' : 'bootstrap'}
            />
            <StatusRow
              label="Libraries"
              meta="Settings remains contextual to archive ownership and policy scope."
              tone={snapshot.libraries.length > 0 ? 'info' : 'warning'}
              value={String(snapshot.libraries.length)}
            />
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Policy
            </p>
            <h2 className="text-xl font-semibold text-foreground">Storage and cleanup posture</h2>
          </div>
          <div className="divide-y divide-border">
            <StatusRow
              label="Originals policy"
              meta="Local-first originals remain the non-negotiable posture."
              tone="success"
              value="local-first"
            />
            <StatusRow
              label="Cleanup policy"
              meta="Delete remains a separate review path and is never coupled implicitly to upload success."
              tone="warning"
              value="manual review"
            />
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Billing
            </p>
            <h2 className="text-xl font-semibold text-foreground">Stripe placeholder</h2>
          </div>
          <div className="divide-y divide-border">
            <StatusRow
              label="Checkout"
              meta="Stripe Checkout and Billing are the documented MVP direction."
              tone="info"
              value="placeholder"
            />
            <StatusRow
              label="Limits"
              meta="Quota and pricing details remain intentionally deferred until plan packaging is finalized."
              tone="warning"
              value="not finalized"
            />
          </div>
        </Card>
      </section>
    </AppShell>
  )
}
