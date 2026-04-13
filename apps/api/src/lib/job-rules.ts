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

  if (input.execution) {
    return validateExecutionManifestForCreate(input)
  }

  return null
}

function validateExecutionManifestForCreate(input: CreateJobInput) {
  const manifest = input.execution

  if (!manifest) {
    return null
  }

  if (manifest.schemaVersion !== 1) {
    return 'Execution manifest schema version is unsupported.'
  }

  if (manifest.operation !== input.kind) {
    return 'Execution manifest operation must match the job kind.'
  }

  if (
    manifest.operation !== 'archive-placement' &&
    manifest.operation !== 'placement-verification'
  ) {
    return 'Execution manifest operation is unsupported.'
  }

  if (!manifest.storageTargetId.trim()) {
    return 'Execution manifest requires a storage target id.'
  }

  if (!manifest.provider.trim()) {
    return 'Execution manifest requires a provider.'
  }

  if (!manifest.relativePath.trim()) {
    return 'Execution manifest requires a relative path.'
  }

  if (!isSafeRelativePath(manifest.relativePath)) {
    return 'Execution manifest relative path must stay within the storage target root.'
  }

  if (!/^[a-f0-9]{64}$/.test(manifest.checksumSha256)) {
    return 'Execution manifest checksum must be a lowercase sha256 hex digest.'
  }

  if (
    manifest.sizeBytes !== undefined &&
    (!Number.isInteger(manifest.sizeBytes) || manifest.sizeBytes < 0)
  ) {
    return 'Execution manifest sizeBytes must be a non-negative integer.'
  }

  if (manifest.operation === 'archive-placement' && !manifest.source) {
    return 'Archive-placement execution manifests require a source reference.'
  }

  if (manifest.source?.kind === 'hosted-staging' && !manifest.source.stagingObjectId?.trim()) {
    return 'Hosted-staging execution manifests require a staging object id.'
  }

  if (manifest.source?.kind === 'agent-local-staging' && !manifest.source.localSourceId?.trim()) {
    return 'Agent-local-staging execution manifests require a local source id.'
  }

  return null
}

function isSafeRelativePath(relativePath: string) {
  if (
    relativePath.startsWith('/') ||
    relativePath.startsWith('\\') ||
    relativePath.includes(':') ||
    relativePath.trim() !== relativePath
  ) {
    return false
  }

  return relativePath
    .replaceAll('\\', '/')
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
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
      status: currentDrill.status,
      startedAt: currentDrill.startedAt ?? new Date().toISOString(),
      completedAt: currentDrill.completedAt,
      notes:
        input.reason ??
        currentDrill.notes ??
        'Restore drill job completed; drill pass state remains governed by explicit evidence.',
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
