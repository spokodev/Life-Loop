'use client'

import type {
  CreateDeviceResponse,
  DashboardSnapshot,
  Device,
  Library,
  StorageTarget,
  StorageTopology,
} from '@life-loop/shared-types'
import { storageTopologies } from '@life-loop/shared-types'
import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Input,
  Select,
  StatusRow,
  Textarea,
  TransitionState,
} from '@life-loop/ui'
import { useRouter } from 'next/navigation'
import type { FormEvent, ReactNode } from 'react'
import { useState } from 'react'

const navItems = [
  { label: 'Overview', hint: 'Return to archive health and current state.' },
  { label: 'Library', hint: 'Create the first archive context.', active: true },
  { label: 'Devices', hint: 'Link the first execution endpoint.' },
  { label: 'Storage', hint: 'Define where originals will live.' },
]

type StepState =
  | 'idle'
  | 'validating'
  | 'in-progress'
  | 'success'
  | 'recoverable-error'
  | 'blocking-error'

const topologyCopy: Record<
  StorageTopology,
  {
    title: string
    description: string
  }
> = {
  'local-first': {
    title: 'Local-first',
    description:
      'Originals live on user-controlled storage first. The hosted layer remains metadata, previews, and convenience.',
  },
  hybrid: {
    title: 'Hybrid',
    description:
      'Originals stay local-first, while selected-online or preview layers remain available from hosted storage.',
  },
  'bring-your-own-storage': {
    title: 'Bring-your-own storage',
    description:
      'The archive will expand toward user-managed providers later, while keeping the same archive truth model.',
  },
}

export function OnboardingFlow({
  apiBaseUrl,
  authEnabled,
  snapshot,
}: {
  apiBaseUrl: string
  authEnabled: boolean
  snapshot: DashboardSnapshot
}) {
  const router = useRouter()
  const [topology, setTopology] = useState<StorageTopology>('local-first')
  const [libraryState, setLibraryState] = useState<StepState>('idle')
  const [deviceState, setDeviceState] = useState<StepState>('idle')
  const [storageState, setStorageState] = useState<StepState>('idle')
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [createdLibrary, setCreatedLibrary] = useState<Library | null>(
    snapshot.libraries[0] ?? null,
  )
  const [createdDevice, setCreatedDevice] = useState<CreateDeviceResponse | null>(null)
  const [createdStorageTarget, setCreatedStorageTarget] = useState<StorageTarget | null>(null)

  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerDisplayName, setOwnerDisplayName] = useState('')
  const [ownerClerkUserId, setOwnerClerkUserId] = useState('')
  const [libraryName, setLibraryName] = useState('')
  const [librarySlug, setLibrarySlug] = useState('')
  const [libraryDescription, setLibraryDescription] = useState('')

  const [deviceName, setDeviceName] = useState('')
  const [devicePlatform, setDevicePlatform] = useState<Device['platform']>('macos')

  const [storageTargetName, setStorageTargetName] = useState('')
  const [storageProvider, setStorageProvider] = useState('LocalDiskProvider')
  const [storageRole, setStorageRole] = useState<StorageTarget['role']>('archive-primary')
  const [storageWritable, setStorageWritable] = useState(true)

  async function handleCreateLibrary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLibraryError(null)

    if (!ownerEmail || !libraryName || !librarySlug) {
      setLibraryState('blocking-error')
      setLibraryError('Owner email, library name, and library slug are required.')
      return
    }

    if (authEnabled && !ownerClerkUserId) {
      setLibraryState('blocking-error')
      setLibraryError('Clerk user id is required while auth integration is enabled.')
      return
    }

    setLibraryState('in-progress')

    const response = await fetch(`${apiBaseUrl}/v1/libraries`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        owner: {
          email: ownerEmail,
          displayName: ownerDisplayName || undefined,
          clerkUserId: ownerClerkUserId || undefined,
        },
        library: {
          name: libraryName,
          slug: librarySlug,
          description: libraryDescription || undefined,
          topology,
        },
      }),
    })

    if (!response.ok) {
      const problem = (await response.json()) as { detail?: string; status?: number }
      setLibraryState(
        problem.status && problem.status >= 500 ? 'recoverable-error' : 'blocking-error',
      )
      setLibraryError(problem.detail ?? 'Library creation failed.')
      return
    }

    const payload = (await response.json()) as { library: Library }
    setCreatedLibrary(payload.library)
    setLibraryState('success')
    setDeviceState('idle')
  }

  async function handleCreateDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDeviceError(null)

    if (!createdLibrary) {
      setDeviceState('blocking-error')
      setDeviceError('Create the library first.')
      return
    }

    if (!deviceName) {
      setDeviceState('blocking-error')
      setDeviceError('Device name is required.')
      return
    }

    setDeviceState('in-progress')

    const response = await fetch(`${apiBaseUrl}/v1/devices`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        libraryId: createdLibrary.id,
        device: {
          name: deviceName,
          platform: devicePlatform,
        },
        requestedBy: {
          email: ownerEmail || undefined,
          clerkUserId: ownerClerkUserId || undefined,
        },
      }),
    })

    if (!response.ok) {
      const problem = (await response.json()) as { detail?: string; status?: number }
      setDeviceState(
        problem.status && problem.status >= 500 ? 'recoverable-error' : 'blocking-error',
      )
      setDeviceError(problem.detail ?? 'Device enrollment setup failed.')
      return
    }

    const payload = (await response.json()) as CreateDeviceResponse
    setCreatedDevice(payload)
    setDeviceState('success')
    setStorageState('idle')
  }

  async function handleCreateStorageTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStorageError(null)

    if (!createdLibrary) {
      setStorageState('blocking-error')
      setStorageError('Create the library first.')
      return
    }

    if (!storageTargetName) {
      setStorageState('blocking-error')
      setStorageError('Storage target name is required.')
      return
    }

    setStorageState('in-progress')

    const response = await fetch(`${apiBaseUrl}/v1/storage-targets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        libraryId: createdLibrary.id,
        storageTarget: {
          name: storageTargetName,
          provider: storageProvider,
          role: storageRole,
          writable: storageWritable,
        },
        requestedBy: {
          email: ownerEmail || undefined,
          clerkUserId: ownerClerkUserId || undefined,
        },
      }),
    })

    if (!response.ok) {
      const problem = (await response.json()) as { detail?: string; status?: number }
      setStorageState(
        problem.status && problem.status >= 500 ? 'recoverable-error' : 'blocking-error',
      )
      setStorageError(problem.detail ?? 'Storage target creation failed.')
      return
    }

    const payload = (await response.json()) as { storageTarget: StorageTarget }
    setCreatedStorageTarget(payload.storageTarget)
    setStorageState('success')
  }

  const onboardingComplete = Boolean(createdLibrary && createdDevice && createdStorageTarget)
  const overallState = onboardingComplete
    ? 'completed-with-warnings'
    : storageState === 'recoverable-error' ||
        deviceState === 'recoverable-error' ||
        libraryState === 'recoverable-error'
      ? 'recoverable-error'
      : libraryState === 'blocking-error' ||
          deviceState === 'blocking-error' ||
          storageState === 'blocking-error'
        ? 'blocking-error'
        : libraryState === 'in-progress' ||
            deviceState === 'in-progress' ||
            storageState === 'in-progress'
          ? 'in-progress'
          : 'idle'

  return (
    <AppShell
      actions={
        <>
          <Button onClick={() => router.push('/')}>Return to overview</Button>
          {onboardingComplete ? (
            <Button onClick={() => router.push('/')} variant="secondary">
              Review control plane
            </Button>
          ) : null}
        </>
      }
      eyebrow="Onboarding"
      navItems={navItems}
      summary="Ask what the user wants to protect, where originals should live, and which device will execute local archive work."
      title="First setup"
    >
      {!authEnabled ? (
        <Banner
          description="Clerk auth is not configured in this environment yet, so onboarding uses explicit owner identity input for bootstrap only."
          title="Bootstrap owner mode"
          tone="warning"
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-4">
          <Card className="space-y-4">
            <div className="space-y-1">
              <Badge tone="info">Step 1</Badge>
              <h2 className="text-xl font-semibold text-foreground">Create the first library</h2>
              <p className="text-sm text-[hsl(var(--color-text-secondary))]">
                The library is the first archive context. It anchors devices, storage targets, and
                future manifests.
              </p>
            </div>
            <form className="grid gap-4" onSubmit={handleCreateLibrary}>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Owner email">
                  <Input
                    onChange={(event) => setOwnerEmail(event.target.value)}
                    placeholder="owner@example.com"
                    type="email"
                    value={ownerEmail}
                  />
                </Field>
                <Field label="Owner display name">
                  <Input
                    onChange={(event) => setOwnerDisplayName(event.target.value)}
                    placeholder="Archive owner"
                    value={ownerDisplayName}
                  />
                </Field>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Library name">
                  <Input
                    onChange={(event) => setLibraryName(event.target.value)}
                    placeholder="Family archive"
                    value={libraryName}
                  />
                </Field>
                <Field label="Library slug">
                  <Input
                    onChange={(event) => setLibrarySlug(event.target.value)}
                    placeholder="family-archive"
                    value={librarySlug}
                  />
                </Field>
              </div>
              {authEnabled ? (
                <Field label="Clerk user id">
                  <Input
                    onChange={(event) => setOwnerClerkUserId(event.target.value)}
                    placeholder="user_..."
                    value={ownerClerkUserId}
                  />
                </Field>
              ) : null}
              <Field label="What setup model fits best right now?">
                <div className="grid gap-3 md:grid-cols-3">
                  {storageTopologies.map((option) => (
                    <button
                      className={`rounded-xl border p-4 text-left transition ${
                        topology === option
                          ? 'border-[hsl(var(--color-primary)/0.45)] bg-[hsl(var(--color-primary)/0.08)]'
                          : 'border-border bg-card'
                      }`}
                      key={option}
                      onClick={() => setTopology(option)}
                      type="button"
                    >
                      <p className="font-semibold text-foreground">{topologyCopy[option].title}</p>
                      <p className="mt-1 text-sm text-[hsl(var(--color-text-secondary))]">
                        {topologyCopy[option].description}
                      </p>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Optional description">
                <Textarea
                  onChange={(event) => setLibraryDescription(event.target.value)}
                  placeholder="What this library is meant to protect and how carefully cleanup should be reviewed."
                  value={libraryDescription}
                />
              </Field>
              {libraryError ? <ErrorText message={libraryError} /> : null}
              <Button type="submit">{createdLibrary ? 'Library created' : 'Create library'}</Button>
            </form>
          </Card>

          <Card className="space-y-4">
            <div className="space-y-1">
              <Badge tone="info">Step 2</Badge>
              <h2 className="text-xl font-semibold text-foreground">Enroll the first device</h2>
              <p className="text-sm text-[hsl(var(--color-text-secondary))]">
                Device enrollment creates the trust anchor for local execution. Desktop agent
                linking still uses a short-lived token.
              </p>
            </div>
            {!createdLibrary ? (
              <TransitionState
                description="The device cannot be enrolled until the first library exists."
                nextAction="Create the library first."
                safeNow="No local execution endpoint has been trusted yet."
                state="blocking-error"
                title="Library required"
              />
            ) : (
              <form className="grid gap-4" onSubmit={handleCreateDevice}>
                <div className="grid gap-2 md:grid-cols-2">
                  <Field label="Device name">
                    <Input
                      onChange={(event) => setDeviceName(event.target.value)}
                      placeholder="MacBook Archive Agent"
                      value={deviceName}
                    />
                  </Field>
                  <Field label="Platform">
                    <Select
                      onChange={(event) =>
                        setDevicePlatform(event.target.value as Device['platform'])
                      }
                      value={devicePlatform}
                    >
                      <option value="macos">macOS</option>
                      <option value="windows">Windows</option>
                      <option value="linux">Linux</option>
                      <option value="ios">iPhone</option>
                    </Select>
                  </Field>
                </div>
                {deviceError ? <ErrorText message={deviceError} /> : null}
                <Button type="submit">
                  {createdDevice ? 'Enrollment token created' : 'Create device enrollment'}
                </Button>
                {createdDevice ? (
                  <div className="rounded-xl border border-border bg-muted p-4">
                    <p className="text-sm font-semibold text-foreground">
                      One-time enrollment token
                    </p>
                    <p className="mt-2 break-all font-mono text-sm text-foreground">
                      {createdDevice.enrollmentToken.token}
                    </p>
                    <p className="mt-2 text-sm text-[hsl(var(--color-text-secondary))]">
                      Expires at{' '}
                      {new Date(createdDevice.enrollmentToken.expiresAt).toLocaleString()}.
                    </p>
                  </div>
                ) : null}
              </form>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="space-y-1">
              <Badge tone="info">Step 3</Badge>
              <h2 className="text-xl font-semibold text-foreground">
                Register the first storage target
              </h2>
              <p className="text-sm text-[hsl(var(--color-text-secondary))]">
                A newly configured target is not yet healthy by default. The system keeps it in
                review until the agent verifies it.
              </p>
            </div>
            {!createdLibrary ? (
              <TransitionState
                description="Storage configuration depends on the library context created in step 1."
                nextAction="Create the library first."
                safeNow="No target is being treated as archive truth."
                state="blocking-error"
                title="Library required"
              />
            ) : (
              <form className="grid gap-4" onSubmit={handleCreateStorageTarget}>
                <div className="grid gap-2 md:grid-cols-2">
                  <Field label="Target name">
                    <Input
                      onChange={(event) => setStorageTargetName(event.target.value)}
                      placeholder="Archive SSD"
                      value={storageTargetName}
                    />
                  </Field>
                  <Field label="Provider">
                    <Select
                      onChange={(event) => setStorageProvider(event.target.value)}
                      value={storageProvider}
                    >
                      <option value="LocalDiskProvider">Local disk</option>
                      <option value="ExternalDriveProvider">External drive</option>
                      <option value="S3Provider">S3-compatible</option>
                      <option value="SMBProvider">SMB</option>
                      <option value="WebDAVProvider">WebDAV</option>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Field label="Role">
                    <Select
                      onChange={(event) =>
                        setStorageRole(event.target.value as StorageTarget['role'])
                      }
                      value={storageRole}
                    >
                      <option value="archive-primary">Archive primary</option>
                      <option value="archive-replica">Archive replica</option>
                      <option value="preview-store">Preview store</option>
                      <option value="selected-online">Selected online</option>
                      <option value="transfer-cache">Transfer cache</option>
                    </Select>
                  </Field>
                  <Field label="Writable now?">
                    <Select
                      onChange={(event) => setStorageWritable(event.target.value === 'true')}
                      value={String(storageWritable)}
                    >
                      <option value="true">Writable</option>
                      <option value="false">Read only</option>
                    </Select>
                  </Field>
                </div>
                {storageError ? <ErrorText message={storageError} /> : null}
                <Button type="submit">
                  {createdStorageTarget ? 'Storage target registered' : 'Register storage target'}
                </Button>
              </form>
            )}
          </Card>
        </div>

        <div className="grid gap-4">
          <TransitionState
            description={
              onboardingComplete
                ? 'The first library, device token, and storage target now exist in the control plane. Storage health still needs agent verification.'
                : 'This flow keeps setup explicit and conservative: library first, device trust second, storage role third.'
            }
            nextAction={
              onboardingComplete
                ? 'Install the desktop agent, redeem the enrollment token, and verify the archive-primary target.'
                : 'Complete the next unfinished step.'
            }
            safeNow={
              onboardingComplete
                ? 'Nothing is marked safe to delete. The storage target remains in review until the agent reports health.'
                : 'No cleanup or archive safety claims are made during incomplete onboarding.'
            }
            state={overallState}
            title={onboardingComplete ? 'Setup completed with warnings' : 'Onboarding in progress'}
          />

          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
                Setup progress
              </p>
              <h2 className="text-xl font-semibold text-foreground">Current state</h2>
            </div>
            <div className="divide-y divide-border">
              <StatusRow
                label="Library"
                meta={
                  createdLibrary
                    ? `${createdLibrary.name} • ${topologyCopy[topology].title}`
                    : 'Required before any other setup step.'
                }
                tone={
                  createdLibrary ? 'success' : libraryState === 'blocking-error' ? 'danger' : 'info'
                }
                value={createdLibrary ? 'created' : libraryState}
              />
              <StatusRow
                label="Device enrollment"
                meta={
                  createdDevice
                    ? `${createdDevice.device.name} • token expires ${new Date(createdDevice.enrollmentToken.expiresAt).toLocaleTimeString()}`
                    : 'Short-lived token will be generated after the library exists.'
                }
                tone={
                  createdDevice ? 'success' : deviceState === 'blocking-error' ? 'danger' : 'info'
                }
                value={createdDevice ? 'token ready' : deviceState}
              />
              <StatusRow
                label="Storage target"
                meta={
                  createdStorageTarget
                    ? `${createdStorageTarget.name} • ${createdStorageTarget.role} • ${createdStorageTarget.healthState}`
                    : 'A configured target is still not healthy until the agent verifies it.'
                }
                tone={
                  createdStorageTarget
                    ? 'warning'
                    : storageState === 'blocking-error'
                      ? 'danger'
                      : 'info'
                }
                value={createdStorageTarget ? 'configured' : storageState}
              />
            </div>
          </Card>
        </div>
      </section>
    </AppShell>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </div>
  )
}

function ErrorText({ message }: { message: string }) {
  return <p className="text-sm text-[hsl(var(--color-danger))]">{message}</p>
}
