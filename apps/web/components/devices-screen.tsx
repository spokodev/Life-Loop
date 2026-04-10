'use client'

import type {
  DashboardSnapshot,
  Device,
  RotateDeviceCredentialResponse,
} from '@life-loop/shared-types'
import {
  AppShell,
  Banner,
  Button,
  Card,
  EmptyState,
  Input,
  StatusRow,
  TransitionState,
} from '@life-loop/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { buildPrimaryNavItems } from './primary-nav'

type DeviceActionState =
  | 'idle'
  | 'in-progress'
  | 'success'
  | 'completed-with-warnings'
  | 'recoverable-error'
  | 'blocking-error'

type DeviceActionForm = {
  revokeReason: string
  rotateState: DeviceActionState
  revokeState: DeviceActionState
  message: string | null
  error: string | null
}

export function DevicesScreen({
  apiBaseUrl,
  authEnabled,
  snapshot: initialSnapshot,
  usingFallback,
}: {
  apiBaseUrl: string
  authEnabled: boolean
  snapshot: DashboardSnapshot
  usingFallback: boolean
}) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [forms, setForms] = useState<Record<string, DeviceActionForm>>({})

  const hasDevices = snapshot.devices.length > 0
  const hasActiveDevice = snapshot.devices.some((device) => device.status === 'active')
  const hasPendingDevice = snapshot.devices.some((device) => device.status === 'pending')
  const hasRevokedDevice = snapshot.devices.some((device) => device.status === 'revoked')

  async function handleRotateCredential(device: Device) {
    const currentForm = getForm(device.id)
    setForm(device.id, {
      ...currentForm,
      rotateState: 'in-progress',
      revokeState: 'idle',
      message: null,
      error: null,
    })

    const response = await fetch(`${apiBaseUrl}/v1/devices/${device.id}/rotate-credential`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    if (!response.ok) {
      const problem = (await response.json()) as { detail?: string; status?: number }
      setForm(device.id, {
        ...currentForm,
        rotateState:
          problem.status && problem.status >= 500 ? 'recoverable-error' : 'blocking-error',
        revokeState: 'idle',
        message: null,
        error: problem.detail ?? 'Credential rotation failed.',
      })
      return
    }

    const payload = (await response.json()) as RotateDeviceCredentialResponse

    setSnapshot((currentSnapshot) => ({
      ...currentSnapshot,
      devices: currentSnapshot.devices.map((currentDevice) =>
        currentDevice.id === payload.device.id ? payload.device : currentDevice,
      ),
    }))

    setForm(device.id, {
      ...currentForm,
      rotateState: 'success',
      revokeState: 'idle',
      message:
        'A new device credential was issued. The audit trail was updated, and old credentials are no longer trusted.',
      error: null,
    })
  }

  async function handleRevokeDevice(device: Device) {
    const currentForm = getForm(device.id)
    setForm(device.id, {
      ...currentForm,
      rotateState: 'idle',
      revokeState: 'in-progress',
      message: null,
      error: null,
    })

    const response = await fetch(`${apiBaseUrl}/v1/devices/${device.id}/revoke`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...(currentForm.revokeReason.trim() ? { reason: currentForm.revokeReason.trim() } : {}),
      }),
    })

    if (!response.ok) {
      const problem = (await response.json()) as { detail?: string; status?: number }
      setForm(device.id, {
        ...currentForm,
        rotateState: 'idle',
        revokeState:
          problem.status && problem.status >= 500 ? 'recoverable-error' : 'blocking-error',
        message: null,
        error: problem.detail ?? 'Device revoke failed.',
      })
      return
    }

    const payload = (await response.json()) as { device: Device }

    setSnapshot((currentSnapshot) => ({
      ...currentSnapshot,
      devices: currentSnapshot.devices.map((currentDevice) =>
        currentDevice.id === payload.device.id ? payload.device : currentDevice,
      ),
    }))

    setForm(device.id, {
      revokeReason: currentForm.revokeReason,
      rotateState: 'idle',
      revokeState: 'completed-with-warnings',
      message:
        'The device was revoked. Existing archive records remain, but this endpoint is no longer trusted for new work.',
      error: null,
    })
  }

  function getForm(deviceId: string): DeviceActionForm {
    return (
      forms[deviceId] ?? {
        revokeReason: '',
        rotateState: 'idle',
        revokeState: 'idle',
        message: null,
        error: null,
      }
    )
  }

  function setForm(deviceId: string, value: DeviceActionForm) {
    setForms((currentForms) => ({
      ...currentForms,
      [deviceId]: value,
    }))
  }

  return (
    <AppShell
      actions={
        <Button onClick={() => router.push('/onboarding')}>
          {hasDevices ? 'Enroll another device' : 'Enroll first device'}
        </Button>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Devices')}
      summary="Devices answer which execution endpoints are connected and trusted. Trust, health, heartbeat time, and operator actions stay visible instead of being implied."
      title="Devices"
    >
      {usingFallback ? (
        <Banner
          description="The device registry could not be loaded, so this page is showing a conservative fallback state."
          title="Device state unavailable"
          tone="warning"
        />
      ) : null}

      {!authEnabled ? (
        <Banner
          description="Bootstrap mode is active in this environment. Device actions still stay explicit, but production auth must remain Clerk-backed."
          title="Operator actions are running without Clerk in this environment"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={
          hasActiveDevice
            ? 'At least one device is active and reporting through the authenticated heartbeat path.'
            : hasPendingDevice
              ? 'A device enrollment exists, but the trust handshake is not complete yet.'
              : hasRevokedDevice
                ? 'Only revoked devices remain in this environment, so no trusted ingest endpoint is available.'
                : 'No connected device is reporting yet.'
        }
        nextAction={
          hasActiveDevice
            ? 'Rotate credentials when trust needs repair, or revoke any endpoint that should stop participating.'
            : 'Use onboarding to create or complete the next device enrollment.'
        }
        safeNow="No local archive execution is assumed unless a device state is explicitly reported here."
        state={
          hasActiveDevice
            ? 'completed-with-warnings'
            : hasPendingDevice
              ? 'partial-success'
              : 'blocking-error'
        }
        title={
          hasActiveDevice
            ? 'Trusted device available'
            : hasPendingDevice
              ? 'Device enrollment awaiting activation'
              : 'No trusted devices'
        }
      />

      {hasDevices ? (
        <section className="grid gap-4">
          {snapshot.devices.map((device) => {
            const form = getForm(device.id)
            const canRotate = device.status === 'active'
            const canRevoke = device.status !== 'revoked'

            return (
              <Card className="space-y-4" key={device.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">{device.name}</h2>
                    <p className="text-sm text-[hsl(var(--color-text-secondary))]">
                      Desktop ingest endpoint • {device.platform}
                    </p>
                  </div>
                  <span className={deviceBadgeClassName(device.status)}>{device.status}</span>
                </div>

                <div className="divide-y divide-border">
                  <StatusRow
                    label="Last seen"
                    meta="Heartbeat time from the authenticated device credential path."
                    tone={device.lastSeenAt ? 'success' : 'warning'}
                    value={device.lastSeenAt ?? 'not yet seen'}
                  />
                  <StatusRow
                    label="Responsibility"
                    meta="The current MVP device role is a desktop ingest endpoint owned by one library."
                    tone="info"
                    value="ingest endpoint"
                  />
                  <StatusRow
                    label="Repair path"
                    meta="Credential rotation is the documented repair action when trust needs to be refreshed."
                    tone={canRotate ? 'info' : 'neutral'}
                    value={canRotate ? 'available' : 'not now'}
                  />
                  <StatusRow
                    label="Device id"
                    meta="Stable control-plane identifier for audit and support trails."
                    tone="neutral"
                    value={device.id}
                  />
                </div>

                {form.error ? (
                  <p className="text-sm text-[hsl(var(--color-danger))]">{form.error}</p>
                ) : null}
                {form.message ? (
                  <p className="text-sm text-[hsl(var(--color-success))]">{form.message}</p>
                ) : null}

                <div className="grid gap-4 rounded-xl border border-border p-4">
                  <div className="grid gap-2">
                    <span className="text-sm font-medium text-foreground">Revoke reason</span>
                    <Input
                      onChange={(event) =>
                        setForm(device.id, {
                          ...form,
                          revokeReason: event.target.value,
                        })
                      }
                      placeholder="Optional explanation for why this endpoint should stop participating"
                      value={form.revokeReason}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={!canRotate || form.rotateState === 'in-progress'}
                      onClick={() => handleRotateCredential(device)}
                      variant="secondary"
                    >
                      {form.rotateState === 'in-progress'
                        ? 'Rotating credential...'
                        : 'Repair by rotating credential'}
                    </Button>
                    <Button
                      disabled={!canRevoke || form.revokeState === 'in-progress'}
                      onClick={() => handleRevokeDevice(device)}
                      variant="danger"
                    >
                      {form.revokeState === 'in-progress' ? 'Revoking device...' : 'Revoke device'}
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
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

function deviceBadgeClassName(status: Device['status']) {
  switch (status) {
    case 'active':
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-success)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-success))]'
    case 'pending':
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-warning)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-warning))]'
    default:
      return 'inline-flex items-center rounded-full bg-[hsl(var(--color-danger)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-danger))]'
  }
}
