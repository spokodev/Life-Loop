'use client'

import { idempotencyKeyHeader } from '@life-loop/config'
import type {
  AuditEvent,
  CreateJobResponse,
  DashboardSnapshot,
  JobRun,
  JobStatus,
  RestoreDrill,
} from '@life-loop/shared-types'
import { jobKinds, jobStatuses } from '@life-loop/shared-types'
import {
  AppShell,
  Banner,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatusRow,
  Textarea,
  TransitionState,
} from '@life-loop/ui'
import { useRouter } from 'next/navigation'
import { type FormEvent, type ReactNode, useState } from 'react'

import { buildPrimaryNavItems } from './primary-nav'

type StepState =
  | 'idle'
  | 'preparing'
  | 'in-progress'
  | 'success'
  | 'partial-success'
  | 'recoverable-error'
  | 'blocking-error'
  | 'completed-with-warnings'

type TransitionFormState = {
  status: JobStatus
  reason: string
  state: StepState
  error: string | null
}

export function JobsScreen({
  apiBaseUrl,
  auditEvents,
  authEnabled,
  jobs: initialJobs,
  snapshot: initialSnapshot,
  usingAuditFallback,
  usingJobsFallback,
  usingSnapshotFallback,
}: {
  apiBaseUrl: string
  auditEvents: AuditEvent[]
  authEnabled: boolean
  jobs: JobRun[]
  snapshot: DashboardSnapshot
  usingAuditFallback: boolean
  usingJobsFallback: boolean
  usingSnapshotFallback: boolean
}) {
  const router = useRouter()
  const [jobs, setJobs] = useState(initialJobs)
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [libraryId, setLibraryId] = useState(initialSnapshot.libraries[0]?.id ?? '')
  const [jobKind, setJobKind] = useState<JobRun['kind']>('restore-drill')
  const [deviceId, setDeviceId] = useState('')
  const [scopeSummary, setScopeSummary] = useState('')
  const [jobNotes, setJobNotes] = useState('')
  const [sampleSize, setSampleSize] = useState('12')
  const [createState, setCreateState] = useState<StepState>('idle')
  const [createMessage, setCreateMessage] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [transitionForms, setTransitionForms] = useState<Record<string, TransitionFormState>>({})

  const selectedLibraryDevices = snapshot.devices.filter((device) => device.libraryId === libraryId)

  const queueSummary = deriveQueueSummary(
    jobs,
    auditEvents,
    usingAuditFallback || usingJobsFallback || usingSnapshotFallback,
  )

  async function handleCreateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    setCreateMessage(null)

    if (!libraryId) {
      setCreateState('blocking-error')
      setCreateError('Select a library before creating a control-plane job.')
      return
    }

    if (jobKind === 'device-heartbeat' && !deviceId) {
      setCreateState('blocking-error')
      setCreateError('Device-heartbeat jobs require a device selection.')
      return
    }

    setCreateState('in-progress')

    const response = await fetch(`${apiBaseUrl}/v1/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [idempotencyKeyHeader]: crypto.randomUUID(),
      },
      body: JSON.stringify({
        libraryId,
        deviceId: deviceId || undefined,
        kind: jobKind,
        metadata: {
          scopeSummary: scopeSummary || undefined,
          notes: jobNotes || undefined,
        },
        restoreDrill:
          jobKind === 'restore-drill'
            ? {
                sampleSize: Number(sampleSize) || 12,
                notes: jobNotes || undefined,
              }
            : undefined,
      }),
    })

    if (!response.ok) {
      const problem = (await response.json()) as { detail?: string; status?: number }
      setCreateState(
        problem.status && problem.status >= 500 ? 'recoverable-error' : 'blocking-error',
      )
      setCreateError(problem.detail ?? 'Job creation failed.')
      return
    }

    const payload = (await response.json()) as CreateJobResponse

    setJobs((currentJobs) => [
      payload.job,
      ...currentJobs.filter((job) => job.id !== payload.job.id),
    ])

    if (payload.restoreDrill) {
      const restoreDrill = payload.restoreDrill

      setSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        restoreDrills: [
          restoreDrill,
          ...currentSnapshot.restoreDrills.filter((drill) => drill.id !== restoreDrill.id),
        ],
      }))
    }

    setCreateState(payload.replayed ? 'completed-with-warnings' : 'success')
    setCreateMessage(
      payload.replayed
        ? 'The same idempotent job request was already recorded, so the existing job was returned.'
        : 'The job is now queued in Postgres with an explicit control-plane status.',
    )
  }

  async function handleTransitionJob(job: JobRun, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const currentForm = getTransitionForm(job.id)
    setTransitionForm(job.id, {
      ...currentForm,
      error: null,
      state: 'in-progress',
    })

    const response = await fetch(`${apiBaseUrl}/v1/jobs/${job.id}/transitions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: currentForm.status,
        reason: currentForm.reason || undefined,
      }),
    })

    if (!response.ok) {
      const problem = (await response.json()) as { detail?: string; status?: number }
      setTransitionForm(job.id, {
        ...currentForm,
        error: problem.detail ?? 'Job transition failed.',
        state: problem.status && problem.status >= 500 ? 'recoverable-error' : 'blocking-error',
      })
      return
    }

    const payload = (await response.json()) as {
      job: JobRun
      restoreDrill?: RestoreDrill
    }

    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === payload.job.id ? payload.job : currentJob,
      ),
    )

    if (payload.restoreDrill) {
      setSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        restoreDrills: currentSnapshot.restoreDrills.map((drill) =>
          drill.id === payload.restoreDrill?.id ? payload.restoreDrill : drill,
        ),
      }))
    }

    setTransitionForm(job.id, {
      status: payload.job.status,
      reason: payload.job.blockingReason ?? '',
      error: null,
      state:
        payload.job.status === 'completed_with_warnings'
          ? 'completed-with-warnings'
          : payload.job.status === 'blocked' || payload.job.status === 'failed'
            ? 'partial-success'
            : 'success',
    })
  }

  function getTransitionForm(jobId: string): TransitionFormState {
    return (
      transitionForms[jobId] ?? {
        status: 'running',
        reason: '',
        error: null,
        state: 'idle',
      }
    )
  }

  function setTransitionForm(jobId: string, value: TransitionFormState) {
    setTransitionForms((currentForms) => ({
      ...currentForms,
      [jobId]: value,
    }))
  }

  return (
    <AppShell
      actions={
        <>
          <Button onClick={() => router.push('/')}>Return to overview</Button>
          <Button onClick={() => router.push('/onboarding')} variant="secondary">
            Review onboarding
          </Button>
        </>
      }
      eyebrow={authEnabled ? 'Clerk shell enabled' : 'Bootstrap mode'}
      navItems={buildPrimaryNavItems('Activity')}
      summary="Explicit control-plane activity state. Jobs are queued, transitioned, and reviewed deliberately instead of being hidden behind vague background activity."
      title="Activity"
    >
      {usingJobsFallback || usingSnapshotFallback || usingAuditFallback ? (
        <Banner
          description="The activity surface is using a conservative fallback for at least one API dependency. This page will not imply active orchestration or event history if the control plane cannot prove it."
          title="Activity data is partially unavailable"
          tone="warning"
        />
      ) : null}

      {!authEnabled ? (
        <Banner
          description="Bootstrap mode is still active here. Job actions remain explicit, but production auth must stay Clerk-backed."
          title="Operator actions are running without Clerk in this environment"
          tone="warning"
        />
      ) : null}

      <TransitionState
        description={queueSummary.description}
        details={queueSummary.details}
        nextAction={queueSummary.nextAction}
        safeNow={queueSummary.safeNow}
        state={queueSummary.state}
        title={queueSummary.title}
      />

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              New job
            </p>
            <h2 className="text-xl font-semibold text-foreground">Queue an explicit MVP job</h2>
            <p className="text-sm text-[hsl(var(--color-text-secondary))]">
              This seeds control-plane metadata intentionally. It does not pretend that bytes moved
              or restores succeeded until later status transitions prove it.
            </p>
          </div>

          {snapshot.libraries.length === 0 ? (
            <TransitionState
              description="No library exists yet, so there is nowhere to anchor job metadata safely."
              nextAction="Complete onboarding and create the first library."
              safeNow="No archival promises are being implied."
              state="blocking-error"
              title="Library required"
            />
          ) : (
            <form className="grid gap-4" onSubmit={handleCreateJob}>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Library">
                  <Select onChange={(event) => setLibraryId(event.target.value)} value={libraryId}>
                    {snapshot.libraries.map((library) => (
                      <option key={library.id} value={library.id}>
                        {library.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Job kind">
                  <Select
                    onChange={(event) => setJobKind(event.target.value as JobRun['kind'])}
                    value={jobKind}
                  >
                    {jobKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Device scope">
                  <Select onChange={(event) => setDeviceId(event.target.value)} value={deviceId}>
                    <option value="">No device selected</option>
                    {selectedLibraryDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name} ({device.platform})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Restore drill sample size">
                  <Input
                    disabled={jobKind !== 'restore-drill'}
                    min={1}
                    onChange={(event) => setSampleSize(event.target.value)}
                    type="number"
                    value={sampleSize}
                  />
                </Field>
              </div>

              <Field label="Scope summary">
                <Input
                  onChange={(event) => setScopeSummary(event.target.value)}
                  placeholder="Verify primary target before cleanup review"
                  value={scopeSummary}
                />
              </Field>

              <Field label="Operator notes">
                <Textarea
                  onChange={(event) => setJobNotes(event.target.value)}
                  placeholder="What should this job clarify, prove, or leave explicitly blocked?"
                  value={jobNotes}
                />
              </Field>

              {createError ? <ErrorText message={createError} /> : null}
              {createMessage ? <SuccessText message={createMessage} /> : null}

              <Button disabled={createState === 'in-progress'} type="submit">
                {createState === 'in-progress' ? 'Queueing job...' : 'Queue job'}
              </Button>
            </form>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Restore baseline
            </p>
            <h2 className="text-xl font-semibold text-foreground">Drill and worker summary</h2>
          </div>
          <div className="divide-y divide-border">
            <StatusRow
              label="Restore drills"
              meta="Mandatory from MVP onward. Backup claims stay weak until drill history exists."
              tone={snapshot.health.restoreDrills === 'passing' ? 'success' : 'warning'}
              value={snapshot.health.restoreDrills}
            />
            <StatusRow
              label="Worker signal"
              meta="Device heartbeat jobs keep worker health explicit instead of implied."
              tone={snapshot.health.worker === 'healthy' ? 'success' : 'warning'}
              value={snapshot.health.worker}
            />
            <StatusRow
              label="Tracked drills"
              meta={
                snapshot.restoreDrills.length > 0
                  ? `${snapshot.restoreDrills[0]?.status} • sample ${snapshot.restoreDrills[0]?.sampleSize}`
                  : 'No restore drill rows exist yet.'
              }
              tone={snapshot.restoreDrills.length > 0 ? 'info' : 'warning'}
              value={String(snapshot.restoreDrills.length)}
            />
          </div>
        </Card>
      </section>

      {jobs.length === 0 ? (
        <EmptyState
          actionLabel="Queue first job"
          description="No control-plane jobs exist yet. Queue one intentionally so the platform can surface explicit progress, warning, blocked, and failure states."
          icon="◎"
          onAction={() => {
            setCreateState('preparing')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          secondary="A calm queue is better than hidden background work. The first useful seed is usually a restore-drill or placement-verification job."
          title="No jobs queued"
        />
      ) : (
        <section className="grid gap-4">
          {jobs.map((job) => {
            const transitionForm = getTransitionForm(job.id)
            const terminal = isTerminalStatus(job.status)

            return (
              <Card className="space-y-4" key={job.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">{job.kind}</h2>
                    <p className="text-sm text-[hsl(var(--color-text-secondary))]">
                      Job {job.id} • correlation {job.correlationId}
                    </p>
                  </div>
                  <div className="min-w-[220px] rounded-xl border border-border bg-muted p-3">
                    <p className="text-sm font-medium text-foreground">Current state</p>
                    <p className="mt-1 text-sm text-[hsl(var(--color-text-secondary))]">
                      {job.status} • attempts {job.attemptCount}
                    </p>
                    {job.blockingReason ? (
                      <p className="mt-2 text-sm text-[hsl(var(--color-danger))]">
                        {job.blockingReason}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="divide-y divide-border">
                  <StatusRow
                    label="Library"
                    meta={job.libraryId ?? 'No library attached'}
                    tone={job.libraryId ? 'info' : 'warning'}
                    value={job.libraryId ? 'linked' : 'missing'}
                  />
                  <StatusRow
                    label="Device"
                    meta={job.deviceId ?? 'No device attached'}
                    tone={job.deviceId ? 'info' : 'neutral'}
                    value={job.deviceId ? 'scoped' : 'none'}
                  />
                  <StatusRow
                    label="Updated"
                    meta={`Created ${job.createdAt}`}
                    tone={toneForJobStatus(job.status)}
                    value={job.updatedAt}
                  />
                </div>

                {terminal ? (
                  <TransitionState
                    description="This job is terminal. The control plane preserves the recorded outcome instead of silently reopening it."
                    nextAction="Queue a follow-up job if more work is needed."
                    safeNow="The existing audit trail and terminal result remain intact."
                    state={
                      job.status === 'completed_with_warnings'
                        ? 'completed-with-warnings'
                        : job.status === 'failed'
                          ? 'recoverable-error'
                          : 'success'
                    }
                    title="Terminal job state"
                  />
                ) : (
                  <form
                    className="grid gap-4 rounded-xl border border-border p-4"
                    onSubmit={(event) => handleTransitionJob(job, event)}
                  >
                    <div className="grid gap-2 md:grid-cols-2">
                      <Field label="Next status">
                        <Select
                          onChange={(event) =>
                            setTransitionForm(job.id, {
                              ...transitionForm,
                              status: event.target.value as JobStatus,
                            })
                          }
                          value={transitionForm.status}
                        >
                          {jobStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Reason or warning summary">
                        <Input
                          onChange={(event) =>
                            setTransitionForm(job.id, {
                              ...transitionForm,
                              reason: event.target.value,
                            })
                          }
                          placeholder="Required for blocked, failed, and warning states"
                          value={transitionForm.reason}
                        />
                      </Field>
                    </div>
                    {transitionForm.error ? <ErrorText message={transitionForm.error} /> : null}
                    {transitionForm.state === 'success' ||
                    transitionForm.state === 'completed-with-warnings' ||
                    transitionForm.state === 'partial-success' ? (
                      <SuccessText message="Job transition recorded in Postgres and audit trail updated." />
                    ) : null}
                    <Button disabled={transitionForm.state === 'in-progress'} type="submit">
                      {transitionForm.state === 'in-progress'
                        ? 'Updating job...'
                        : 'Apply transition'}
                    </Button>
                  </form>
                )}
              </Card>
            )
          })}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Event summary
            </p>
            <h2 className="text-xl font-semibold text-foreground">What changed recently</h2>
          </div>
          <div className="divide-y divide-border">
            <StatusRow
              label="Recorded events"
              meta="Time-ordered control-plane events visible to operators."
              tone={auditEvents.length > 0 ? 'info' : 'warning'}
              value={String(auditEvents.length)}
            />
            <StatusRow
              label="Retry events"
              meta="Retries stay explicit in the audit trail rather than being flattened away."
              tone={countRetryEvents(auditEvents) > 0 ? 'warning' : 'neutral'}
              value={String(countRetryEvents(auditEvents))}
            />
            <StatusRow
              label="Failure or block events"
              meta="Blocked and failed transitions remain visible until operators review them."
              tone={countFailureLikeEvents(auditEvents) > 0 ? 'danger' : 'neutral'}
              value={String(countFailureLikeEvents(auditEvents))}
            />
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[hsl(var(--color-text-muted))]">
              Event timeline
            </p>
            <h2 className="text-xl font-semibold text-foreground">Recent control-plane events</h2>
          </div>
          {auditEvents.length === 0 ? (
            <EmptyState
              actionLabel="Review onboarding"
              description="No audit events are recorded yet in this environment."
              icon="◌"
              onAction={() => router.push('/onboarding')}
              secondary="Once operators create libraries, devices, storage targets, or jobs, those actions appear here as a time-ordered trail."
              title="No activity events yet"
            />
          ) : (
            <div className="divide-y divide-border">
              {auditEvents.map((event) => (
                <div className="space-y-2 py-3" key={event.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{event.summary}</p>
                      <p className="text-sm text-[hsl(var(--color-text-secondary))]">
                        {event.details ?? 'No explanation provided.'}
                      </p>
                    </div>
                    <span className={eventBadgeClassName(event)}>{event.actorType}</span>
                  </div>
                  <div className="grid gap-1 text-sm text-[hsl(var(--color-text-secondary))] sm:grid-cols-2">
                    <p>{event.occurredAt}</p>
                    <p>correlation {event.correlationId}</p>
                    <p>{event.eventType}</p>
                    <p>
                      {event.jobId
                        ? `job ${event.jobId}`
                        : event.deviceId
                          ? `device ${event.deviceId}`
                          : event.assetId
                            ? `asset ${event.assetId}`
                            : 'no linked entity'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
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

function SuccessText({ message }: { message: string }) {
  return <p className="text-sm text-[hsl(var(--color-success))]">{message}</p>
}

function isTerminalStatus(status: JobStatus) {
  return ['succeeded', 'completed_with_warnings', 'failed', 'cancelled'].includes(status)
}

function toneForJobStatus(status: JobStatus) {
  if (status === 'succeeded') {
    return 'success' as const
  }

  if (status === 'completed_with_warnings' || status === 'blocked') {
    return 'warning' as const
  }

  if (status === 'failed') {
    return 'danger' as const
  }

  return 'info' as const
}

function deriveQueueSummary(jobs: JobRun[], auditEvents: AuditEvent[], usingFallback: boolean) {
  if (usingFallback) {
    return {
      state: 'disconnected-dependency' as const,
      title: 'Job queue partially unavailable',
      description:
        'At least one control-plane dependency could not be loaded, so this page is refusing to overstate queue health.',
      nextAction: 'Verify API availability, then refresh the queue view.',
      safeNow: 'No background work is being assumed to have completed.',
      details: null,
    }
  }

  if (jobs.length === 0) {
    return {
      state: 'empty' as const,
      title: 'No queued work yet',
      description:
        'The job model is present, but no explicit control-plane work has been recorded yet in this environment.',
      nextAction: 'Queue a restore-drill, cleanup-review, or placement-verification job.',
      safeNow: 'Nothing is being treated as archived, verified, or cleanup-ready by implication.',
      details: null,
    }
  }

  const counts: Record<JobStatus, number> = {
    blocked: 0,
    cancelled: 0,
    completed_with_warnings: 0,
    failed: 0,
    queued: 0,
    retrying: 0,
    running: 0,
    succeeded: 0,
  }

  for (const job of jobs) {
    counts[job.status] += 1
  }

  const details = (
    <ul className="grid gap-2 sm:grid-cols-2">
      {Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => (
          <li key={status}>
            {status}: {count}
          </li>
        ))}
    </ul>
  )

  if (counts.blocked > 0 || counts.failed > 0) {
    return {
      state: 'partial-success' as const,
      title: 'Queue has blockers or failed work',
      description:
        'Some jobs are proceeding or completed, but at least one recorded job still needs review or recovery.',
      nextAction: 'Inspect blocked or failed jobs and apply an explicit next transition.',
      safeNow: 'The queue is visible, and the audit trail preserves why work blocked or failed.',
      details,
    }
  }

  if (counts.running > 0 || counts.retrying > 0) {
    return {
      state: 'in-progress' as const,
      title: 'Queue in progress',
      description:
        'The control plane has active work in flight and is naming that work directly instead of flattening it into a generic busy state.',
      nextAction:
        'Monitor active jobs and record explicit completion or warning states when work finishes.',
      safeNow: 'Prior completed jobs remain visible while in-flight work is still pending.',
      details,
    }
  }

  if (counts.completed_with_warnings > 0) {
    return {
      state: 'completed-with-warnings' as const,
      title: 'Work completed with warnings',
      description:
        'No active work remains, but at least one job ended with a warning that should stay visible to operators.',
      nextAction: 'Review warning summaries and decide whether a follow-up job is required.',
      safeNow: 'Completed work is recorded, but warning paths remain explicit.',
      details,
    }
  }

  if (counts.succeeded > 0) {
    return {
      state: 'success' as const,
      title: 'Queue is stable',
      description:
        'Recent jobs completed successfully and are now part of the durable control-plane history.',
      nextAction: 'Queue the next intentional job or inspect recent activity events.',
      safeNow: `Terminal results are visible and backed by ${auditEvents.length} recent audit events.`,
      details,
    }
  }

  return {
    state: 'preparing' as const,
    title: 'Queued work awaiting execution',
    description: 'Jobs exist, but they have not yet advanced into a running or terminal state.',
    nextAction: 'Advance the next queued job when the required dependency is ready.',
    safeNow: 'Queued metadata alone does not imply completed archive work.',
    details,
  }
}

function countRetryEvents(auditEvents: AuditEvent[]) {
  return auditEvents.filter(
    (event) =>
      event.eventType === 'job.status_changed' &&
      (event.details?.includes('-> retrying') || event.summary.includes('retry')),
  ).length
}

function countFailureLikeEvents(auditEvents: AuditEvent[]) {
  return auditEvents.filter(
    (event) =>
      event.eventType === 'job.status_changed' &&
      (event.details?.includes('-> failed') || event.details?.includes('-> blocked')),
  ).length
}

function eventBadgeClassName(event: AuditEvent) {
  if (
    event.eventType === 'job.status_changed' &&
    (event.details?.includes('-> failed') || event.details?.includes('-> blocked'))
  ) {
    return 'inline-flex items-center rounded-full bg-[hsl(var(--color-danger)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-danger))]'
  }

  if (event.eventType === 'job.status_changed' && event.details?.includes('-> retrying')) {
    return 'inline-flex items-center rounded-full bg-[hsl(var(--color-warning)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-warning))]'
  }

  if (event.actorType === 'device') {
    return 'inline-flex items-center rounded-full bg-[hsl(var(--color-info)/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-info))]'
  }

  return 'inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground'
}
