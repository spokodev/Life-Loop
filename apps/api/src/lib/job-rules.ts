import type {
  CreateJobInput,
  JobRun,
  JobStatus,
  RestoreDrill,
  TransitionJobInput,
} from '@life-loop/shared-types'

const terminalJobStatuses = new Set<JobStatus>([
  'succeeded',
  'completed_with_warnings',
  'failed',
  'cancelled',
])

export function isTerminalJobStatus(status: JobStatus) {
  return terminalJobStatuses.has(status)
}

export function validateCreateJobInput(input: CreateJobInput) {
  if (input.kind === 'restore-drill' && !input.libraryId) {
    return 'Restore-drill jobs require a library id.'
  }

  if (input.kind === 'device-heartbeat' && !input.deviceId) {
    return 'Device-heartbeat jobs require a device id.'
  }

  return null
}

export function validateJobTransition(job: JobRun, input: TransitionJobInput) {
  if (isTerminalJobStatus(job.status) && job.status !== input.status) {
    return `Job ${job.id} is already terminal with status ${job.status}.`
  }

  if ((input.status === 'blocked' || input.status === 'failed') && !input.reason?.trim()) {
    return `A reason is required when transitioning a job to ${input.status}.`
  }

  if (input.status === 'completed_with_warnings' && !input.reason?.trim()) {
    return 'A warning summary is required when transitioning a job to completed_with_warnings.'
  }

  return null
}

export function mapRestoreDrillFromStatus(currentDrill: RestoreDrill, input: TransitionJobInput) {
  if (input.status === 'running') {
    return {
      status: 'running' as const,
      startedAt: currentDrill.startedAt ?? new Date().toISOString(),
      completedAt: undefined,
      notes: currentDrill.notes,
    }
  }

  if (input.status === 'succeeded' || input.status === 'completed_with_warnings') {
    return {
      status: 'passed' as const,
      startedAt: currentDrill.startedAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
      notes: input.reason ?? currentDrill.notes,
    }
  }

  if (input.status === 'failed' || input.status === 'cancelled') {
    return {
      status: 'failed' as const,
      startedAt: currentDrill.startedAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
      notes: input.reason ?? currentDrill.notes,
    }
  }

  if (input.status === 'retrying') {
    return {
      status: currentDrill.startedAt ? ('running' as const) : ('scheduled' as const),
      startedAt: currentDrill.startedAt,
      completedAt: undefined,
      notes: input.reason ?? currentDrill.notes,
    }
  }

  return {
    status: currentDrill.status,
    startedAt: currentDrill.startedAt,
    completedAt: currentDrill.completedAt,
    notes: input.reason ?? currentDrill.notes,
  }
}
