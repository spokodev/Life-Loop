import type {
  AssetLifecycleState,
  DeviceStatus,
  HostedStagingStatus,
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
  sourceDeviceId?: string
  filename: string
  captureDate?: string
  lifecycleState: AssetLifecycleState
  blobCount: number
  placementCount: number
  verifiedPlacementCount: number
}

export interface Blob {
  id: string
  assetId: string
  kind: 'original' | 'paired-motion' | 'normalized' | 'preview'
  checksumSha256: string
  sizeBytes: number
  mimeType?: string
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

export interface AssetPlacementDetail extends Placement {
  blobKind: Blob['kind']
  storageTargetName: string
  storageTargetProvider: string
  storageTargetWritable: boolean
}

export interface AssetDetail {
  asset: Asset
  blobs: Blob[]
  placements: AssetPlacementDetail[]
}

export interface RestoreCandidate {
  assetId: string
  libraryId: string
  filename: string
  lifecycleState: AssetLifecycleState
  restoreStatus: 'ready' | 'degraded' | 'blocked'
  restoreSource?: string
  restoreScope: string
  expectedResult: string
  warning?: string
}

export interface RestoreReadiness {
  summary: {
    readyCount: number
    degradedCount: number
    blockedCount: number
  }
  candidates: RestoreCandidate[]
}

export type CleanupReadinessStatus = 'eligible_for_review' | 'blocked' | 'manual_review'

export interface CleanupCandidate {
  assetId: string
  libraryId: string
  filename: string
  lifecycleState: AssetLifecycleState
  cleanupStatus: CleanupReadinessStatus
  blockers: string[]
  evidence: {
    verifiedPrimaryCount: number
    verifiedReplicaCount: number
    verifiedRestoreEvidenceCount: number
    restoreDrillPassed: boolean
    latestRestoreDrillStatus?: RestoreDrill['status']
  }
}

export interface CleanupReviewReadiness {
  summary: {
    eligibleForReviewCount: number
    blockedCount: number
    manualReviewCount: number
    totalCandidates: number
  }
  candidates: CleanupCandidate[]
}

export interface StorageReadinessTarget extends StorageTarget {
  connectionState: 'healthy' | 'verifying' | 'stale' | 'unavailable'
  placementCount: number
  verifiedPlacementCount: number
  pendingVerificationCount: number
  spacePressure: 'telemetry-unavailable'
  lastVerifiedAt?: string
  warning?: string
}

export interface StorageReadiness {
  summary: {
    healthyTargets: number
    staleTargets: number
    unavailableTargets: number
    pendingVerificationPlacements: number
  }
  targets: StorageReadinessTarget[]
}

export interface JobRun {
  id: string
  libraryId?: string
  assetId?: string
  deviceId?: string
  claimedByDeviceId?: string
  kind: JobKind
  status: JobStatus
  correlationId: string
  attemptCount: number
  createdAt: string
  updatedAt: string
  leaseExpiresAt?: string
  lastHeartbeatAt?: string
  startedAt?: string
  completedAt?: string
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

export type RestoreDrillEvidenceStatus =
  | 'ready'
  | 'restored'
  | 'verified'
  | 'partial'
  | 'failed'
  | 'blocked'

export interface RestoreDrillEvidence {
  id: string
  restoreDrillId: string
  assetId: string
  storageTargetId?: string
  candidateStatus: RestoreCandidate['restoreStatus']
  evidenceStatus: RestoreDrillEvidenceStatus
  checksumSha256?: string
  safeErrorClass?: string
  summary: string
  verifiedAt?: string
  createdAt: string
  updatedAt: string
}

export interface RestoreDrillDetail {
  drill: RestoreDrill
  evidence: RestoreDrillEvidence[]
}

export interface RecordRestoreDrillEvidenceInput {
  assetId: string
  storageTargetId?: string
  candidateStatus: RestoreCandidate['restoreStatus']
  evidenceStatus: RestoreDrillEvidenceStatus
  checksumSha256?: string
  safeErrorClass?: string
  summary: string
  verifiedAt?: string
}

export interface RecordRestoreDrillEvidenceResponse {
  drill: RestoreDrill
  evidence: RestoreDrillEvidence
}

export interface HostedStagingObject {
  id: string
  libraryId: string
  deviceId: string
  assetId?: string
  status: HostedStagingStatus
  filename: string
  contentType?: string
  checksumSha256: string
  sizeBytes: number
  uploadedBytes: number
  expiresAt: string
  retentionEligibleAt?: string
  completedAt?: string
  blockedReason?: string
  safeErrorClass?: string
  createdAt: string
  updatedAt: string
}

export interface ReserveHostedStagingUploadInput {
  libraryId: string
  filename: string
  contentType?: string
  checksumSha256: string
  sizeBytes: number
}

export interface ReserveHostedStagingUploadResponse {
  stagingObject: HostedStagingObject
  upload: {
    method: 'PUT'
    url: string
    expiresAt: string
  }
}

export interface ListHostedStagingObjectsResponse {
  stagingObjects: HostedStagingObject[]
}

export interface AuditEvent {
  id: string
  libraryId?: string
  actorType: 'user' | 'device' | 'system'
  actorId?: string
  eventType: string
  correlationId: string
  occurredAt: string
  summary: string
  details?: string
  jobId?: string
  assetId?: string
  deviceId?: string
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

export interface DeviceCredential {
  token: string
  issuedAt: string
}

export interface CreateDeviceResponse {
  device: Device
  enrollmentToken: DeviceEnrollmentToken
}

export interface RedeemDeviceEnrollmentTokenInput {
  enrollmentToken: string
}

export interface RedeemDeviceEnrollmentTokenResponse {
  device: Device
  credential: DeviceCredential
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
  execution?: JobExecutionManifest
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

export interface ClaimJobInput {
  kinds?: JobKind[]
  leaseSeconds?: number
}

export interface JobLease {
  leaseToken: string
  leaseExpiresAt: string
}

export interface JobExecutionManifest {
  schemaVersion: 1
  operation: 'archive-placement' | 'placement-verification'
  storageTargetId: string
  provider: string
  relativePath: string
  blobId?: string
  assetId?: string
  checksumSha256: string
  sizeBytes?: number
  source?: {
    kind: 'agent-local-staging' | 'hosted-staging'
    localSourceId?: string
    stagingObjectId?: string
  }
}

export interface ClaimJobResponse {
  claim?: {
    job: JobRun
    lease: JobLease
    execution?: JobExecutionManifest
  }
  recoveredExpiredCount: number
}

export interface HeartbeatJobClaimInput {
  leaseToken: string
  leaseSeconds?: number
}

export interface HeartbeatJobClaimResponse {
  job: JobRun
  lease: JobLease
}

export type CompleteJobClaimStatus = 'succeeded' | 'completed_with_warnings' | 'failed' | 'blocked'

export interface CompleteJobClaimInput {
  leaseToken: string
  status: CompleteJobClaimStatus
  reason?: string
  safeErrorClass?: string
}

export interface CompleteJobClaimResponse {
  job: JobRun
}

export interface BillingStatus {
  customer?: {
    stripeCustomerId: string
    email: string
    displayName?: string
  }
  subscription?: {
    stripeSubscriptionId: string
    status: string
    stripePriceId?: string
    currentPeriodEnd?: string
    latestStripeEventId?: string
  }
}

export interface CreateBillingCheckoutSessionResponse {
  sessionId: string
  url: string
}

export interface CreateBillingPortalSessionResponse {
  url: string
}

export interface DeviceHeartbeatInput {
  observedAt?: string
  hostname?: string
  agentVersion?: string
}

export interface DeviceHeartbeatResponse {
  acceptedAt: string
  device: Device
}

export interface RotateDeviceCredentialInput {
  requestedBy?: OwnerIdentityInput
}

export interface RotateDeviceCredentialResponse {
  device: Device
  credential: DeviceCredential
}

export interface RevokeDeviceInput {
  reason?: string
  requestedBy?: OwnerIdentityInput
}

export interface AssetBlobInput {
  kind: Blob['kind']
  checksumSha256: string
  sizeBytes: number
  mimeType?: string
}

export interface AssetPlacementInput {
  blobKind: Blob['kind']
  storageTargetId: string
  role: StorageRole
  checksumSha256?: string
  verified?: boolean
  healthState?: PlacementHealthState
}

export interface ReportIngestAssetInput {
  libraryId: string
  filename: string
  captureDate?: string
  assetMetadata?: Record<string, unknown>
  blobs: AssetBlobInput[]
  placements: AssetPlacementInput[]
}

export interface ReportIngestAssetResponse {
  asset: Asset
  replayed: boolean
  job: JobRun
}
