import type {
  AssetLifecycleState,
  DeviceStatus,
  JobKind,
  JobStatus,
  PlacementHealthState,
  StorageRole,
} from './lifecycle'

export interface Library {
  id: string
  slug: string
  name: string
  description?: string
  assetCount: number
}

export interface Device {
  id: string
  libraryId: string
  name: string
  platform: 'macos' | 'windows' | 'linux' | 'ios'
  status: DeviceStatus
  lastSeenAt?: string
}

export interface StorageTarget {
  id: string
  libraryId: string
  name: string
  role: StorageRole
  provider: string
  writable: boolean
  healthy: boolean
  healthState: PlacementHealthState
}

export interface Asset {
  id: string
  libraryId: string
  filename: string
  captureDate?: string
  lifecycleState: AssetLifecycleState
  blobCount: number
}

export interface Blob {
  id: string
  assetId: string
  kind: 'original' | 'paired-motion' | 'normalized' | 'preview'
  checksumSha256: string
  sizeBytes: number
}

export interface Placement {
  id: string
  blobId: string
  storageTargetId: string
  role: StorageRole
  checksumSha256: string
  healthState: PlacementHealthState
  verifiedAt?: string
}

export interface JobRun {
  id: string
  libraryId?: string
  assetId?: string
  deviceId?: string
  kind: JobKind
  status: JobStatus
  correlationId: string
  attemptCount: number
  createdAt: string
  updatedAt: string
  blockingReason?: string
}

export interface RestoreDrill {
  id: string
  libraryId: string
  status: 'scheduled' | 'running' | 'passed' | 'failed'
  sampleSize: number
  startedAt?: string
  completedAt?: string
  notes?: string
}

export interface AuditEvent {
  id: string
  libraryId?: string
  actorType: 'user' | 'device' | 'system'
  eventType: string
  correlationId: string
  occurredAt: string
}

export interface HealthSummary {
  api: 'healthy' | 'degraded'
  database: 'healthy' | 'degraded'
  worker: 'healthy' | 'degraded'
  restoreDrills: 'passing' | 'attention-required'
}

export interface DashboardSnapshot {
  health: HealthSummary
  libraries: Library[]
  devices: Device[]
  storageTargets: StorageTarget[]
  jobs: JobRun[]
  restoreDrills: RestoreDrill[]
}

export const storageTopologies = ['local-first', 'hybrid', 'bring-your-own-storage'] as const

export type StorageTopology = (typeof storageTopologies)[number]

export interface OwnerIdentityInput {
  email: string
  displayName?: string
  clerkUserId?: string
}

export interface CreateLibraryInput {
  owner: OwnerIdentityInput
  library: {
    name: string
    slug: string
    description?: string
    topology: StorageTopology
  }
}

export interface CreateDeviceInput {
  libraryId: string
  device: {
    name: string
    platform: Device['platform']
  }
  requestedBy?: OwnerIdentityInput
}

export interface DeviceEnrollmentToken {
  token: string
  expiresAt: string
}

export interface CreateDeviceResponse {
  device: Device
  enrollmentToken: DeviceEnrollmentToken
}

export interface CreateStorageTargetInput {
  libraryId: string
  storageTarget: {
    name: string
    provider: string
    role: StorageRole
    writable: boolean
  }
  requestedBy?: OwnerIdentityInput
}

export interface CreateJobInput {
  libraryId: string
  deviceId?: string
  assetId?: string
  kind: JobKind
  metadata?: {
    scopeSummary?: string
    notes?: string
  }
  restoreDrill?: {
    sampleSize?: number
    notes?: string
  }
  requestedBy?: OwnerIdentityInput
}

export interface CreateJobResponse {
  job: JobRun
  replayed: boolean
  restoreDrill?: RestoreDrill
}

export interface TransitionJobInput {
  status: JobStatus
  reason?: string
  requestedBy?: OwnerIdentityInput
}
