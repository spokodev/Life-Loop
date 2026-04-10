'use client'

import { useAuth } from '@clerk/nextjs'
import type { DashboardSnapshot } from '@life-loop/shared-types'
import { AppShell, Banner, Button, Card, StatusRow, TransitionState } from '@life-loop/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { buildPrimaryNavItems } from './primary-nav'

export function SettingsScreen({
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
  if (authEnabled) {
    return (
      <AuthenticatedSettingsScreen
        apiBaseUrl={apiBaseUrl}
        authEnabled={authEnabled}
        snapshot={snapshot}
        usingFallback={usingFallback}
      />
    )
  }

  return (
    <SettingsScreenContent
      apiBaseUrl={apiBaseUrl}
      authEnabled={authEnabled}
      snapshot={snapshot}
      usingFallback={usingFallback}
    />
  )
}

function AuthenticatedSettingsScreen({
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
  const { getToken, isLoaded, isSignedIn } = useAuth()

  return (
    <SettingsScreenContent
      apiBaseUrl={apiBaseUrl}
      authEnabled={authEnabled}
      getToken={getToken}
      isAuthLoaded={isLoaded}
      isSignedIn={Boolean(isSignedIn)}
      snapshot={snapshot}
      usingFallback={usingFallback}
    />
  )
}

function SettingsScreenContent({
  apiBaseUrl,
  authEnabled,
  getToken,
  isAuthLoaded = true,
  isSignedIn = false,
  snapshot,
  usingFallback,
}: {
  apiBaseUrl: string
  authEnabled: boolean
  getToken?: () => Promise<string | null>
  isAuthLoaded?: boolean
  isSignedIn?: boolean
  snapshot: DashboardSnapshot
  usingFallback: boolean
}) {
  const router = useRouter()
  const [billingError, setBillingError] = useState<string | null>(null)
  const [billingActionState, setBillingActionState] = useState<'idle' | 'in-progress'>('idle')

  async function startStripeFlow(kind: 'checkout-session' | 'customer-portal-session') {
    setBillingError(null)

    if (!authEnabled) {
      setBillingError('Stripe billing actions require Clerk auth in MVP.')
      return
    }

    if (!isAuthLoaded || !isSignedIn || !getToken) {
      setBillingError('Sign in with Clerk before opening Stripe billing.')
      return
    }

    setBillingActionState('in-progress')

    try {
      const token = await getToken()

      if (!token) {
        throw new Error('Clerk did not return a session token for billing.')
      }

      const response = await fetch(`${apiBaseUrl}/v1/billing/${kind}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string }
        throw new Error(problem.detail ?? 'Billing request failed.')
      }

      const payload = (await response.json()) as { url: string }
      window.location.assign(payload.url)
    } catch (error) {
      setBillingActionState('idle')
      setBillingError(error instanceof Error ? error.message : 'Billing request failed.')
    }
  }

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
            <h2 className="text-xl font-semibold text-foreground">Stripe-hosted billing</h2>
          </div>
          <div className="divide-y divide-border">
            <StatusRow
              label="Checkout"
              meta="Checkout stays on Stripe-hosted UI and does not alter archive health."
              tone={authEnabled ? 'info' : 'warning'}
              value={authEnabled ? 'available' : 'requires Clerk'}
            />
            <StatusRow
              label="Subscription status"
              meta="The local projection is display-only; it never gates cleanup, restore, or archive execution."
              tone="info"
              value="display-only"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={billingActionState === 'in-progress'}
              onClick={() => void startStripeFlow('checkout-session')}
            >
              Open Checkout
            </Button>
            <Button
              disabled={billingActionState === 'in-progress'}
              onClick={() => void startStripeFlow('customer-portal-session')}
              variant="secondary"
            >
              Open Portal
            </Button>
          </div>
          {billingError ? (
            <p className="text-sm text-[hsl(var(--color-danger))]">{billingError}</p>
          ) : null}
        </Card>
      </section>
    </AppShell>
  )
}
