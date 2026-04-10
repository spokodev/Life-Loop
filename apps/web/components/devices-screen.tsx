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

export function DevicesScreen({
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
  const hasDevices = snapshot.devices.length > 0
  const hasActiveDevice = snapshot.devices.some((device) => device.status === 'active')
  const hasPendingDevice = snapshot.devices.some((device) => device.status === 'pending')

  return (
    <AppShell
      actions={
        <Button onClick={() => router.push('/onboarding')}>
          {hasDevices ? 'Enroll another device' : 'Enroll first device'}
        </Button>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Devices')}
      summary="Devices answer which execution endpoints are connected and trusted. Last seen time and trust state stay visible instead of being implied."
      title="Devices"
    >
      {usingFallback ? (
        <Banner
          description="The device registry could not be loaded, so this page is showing a conservative fallback state."
          title="Device state unavailable"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={
          hasActiveDevice
            ? 'At least one device is marked active, but real authenticated heartbeat plumbing is still pending.'
            : hasPendingDevice
              ? 'A device enrollment exists, but the trust handshake is not complete yet.'
              : 'No connected device is reporting yet.'
        }
        nextAction={
          hasActiveDevice
            ? 'Continue wiring the desktop agent handshake once the device credential model is documented.'
            : 'Use onboarding to create or complete the next device enrollment.'
        }
        safeNow="No local archive execution is being assumed on this screen unless device state is explicitly reported."
        state={
          hasActiveDevice
            ? 'completed-with-warnings'
            : hasPendingDevice
              ? 'partial-success'
              : 'blocking-error'
        }
        title={
          hasActiveDevice
            ? 'Device trust partially established'
            : hasPendingDevice
              ? 'Device enrollment awaiting activation'
              : 'No trusted devices'
        }
      />

      {hasDevices ? (
        <section className="grid gap-4">
          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                Connected and pending
              </p>
              <h2 className="text-xl font-semibold text-foreground">Device trust surface</h2>
            </div>
            <div className="divide-y divide-border">
              {snapshot.devices.map((device) => (
                <StatusRow
                  key={device.id}
                  label={device.name}
                  meta={`${device.platform} • ${device.lastSeenAt ?? 'no heartbeat yet'} • ${device.id}`}
                  tone={
                    device.status === 'active'
                      ? 'success'
                      : device.status === 'pending'
                        ? 'warning'
                        : 'danger'
                  }
                  value={device.status}
                />
              ))}
            </div>
          </Card>
        </section>
      ) : (
        <EmptyState
          actionLabel="Open onboarding"
          description="No device enrollment exists yet. The desktop agent remains a first-class subsystem, so archive execution cannot be implied from the control plane alone."
          icon="▣"
          onAction={() => router.push('/onboarding')}
          secondary="The next documented step is to create a one-time enrollment token and then link the local agent."
          title="No devices enrolled"
        />
      )}
    </AppShell>
  )
}
