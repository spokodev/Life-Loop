export const assetLifecycleStates = [
  'discovered',
  'ingested',
  'hashed',
  'normalized',
  'archived_primary_pending_verify',
  'archived_primary_verified',
  'archived_replica_pending_verify',
  'archived_replica_verified',
  'safe_archived',
  'selected_online_published',
  'cleanup_eligible',
  'cleanup_confirmed',
  'manual_review',
] as const

export type AssetLifecycleState = (typeof assetLifecycleStates)[number]

export const blobKinds = ['original', 'paired-motion', 'normalized', 'preview'] as const
export type BlobKind = (typeof blobKinds)[number]

export const storageRoles = [
  'archive-primary',
  'archive-replica',
  'preview-store',
  'selected-online',
  'transfer-cache',
] as const

export type StorageRole = (typeof storageRoles)[number]

export const placementHealthStates = [
  'healthy',
  'verifying',
  'degraded',
  'stale',
  'unavailable',
  'needs_review',
] as const

export type PlacementHealthState = (typeof placementHealthStates)[number]

export const jobStatuses = [
  'queued',
  'running',
  'retrying',
  'succeeded',
  'completed_with_warnings',
  'failed',
  'cancelled',
  'blocked',
] as const

export type JobStatus = (typeof jobStatuses)[number]

export const jobKinds = [
  'ingest-normalization',
  'archive-placement',
  'placement-verification',
  'replica-sync',
  'selected-online-publish',
  'restore-drill',
  'device-heartbeat',
  'cleanup-review',
] as const

export type JobKind = (typeof jobKinds)[number]

export const deviceStatuses = ['pending', 'active', 'paused', 'revoked'] as const
export type DeviceStatus = (typeof deviceStatuses)[number]

export const hostedStagingStatuses = [
  'reserved',
  'uploading',
  'staged',
  'archiving',
  'verified',
  'blocked',
  'expired',
] as const

export type HostedStagingStatus = (typeof hostedStagingStatuses)[number]
