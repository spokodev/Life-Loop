import type { AssetLifecycleState, AssetPlacementInput } from '@life-loop/shared-types'

export function deriveAssetLifecycleState(placements: AssetPlacementInput[]): AssetLifecycleState {
  const primaryPlacements = placements.filter((placement) => placement.role === 'archive-primary')
  const replicaPlacements = placements.filter((placement) => placement.role === 'archive-replica')

  const hasPrimaryVerified = primaryPlacements.some(isPlacementVerified)
  const hasPrimaryPending = primaryPlacements.length > 0 && !hasPrimaryVerified
  const hasReplicaVerified = replicaPlacements.some(isPlacementVerified)
  const hasReplicaPending = replicaPlacements.length > 0 && !hasReplicaVerified

  if (hasPrimaryVerified && hasReplicaVerified) {
    return 'safe_archived'
  }

  if (hasReplicaVerified) {
    return 'archived_replica_verified'
  }

  if (hasReplicaPending) {
    return 'archived_replica_pending_verify'
  }

  if (hasPrimaryVerified) {
    return 'archived_primary_verified'
  }

  if (hasPrimaryPending) {
    return 'archived_primary_pending_verify'
  }

  return 'ingested'
}

export function deriveArchivePlacementJobStatus(placements: AssetPlacementInput[]) {
  const lifecycleState = deriveAssetLifecycleState(placements)

  return lifecycleState === 'safe_archived' ? 'succeeded' : 'completed_with_warnings'
}

function isPlacementVerified(placement: AssetPlacementInput) {
  if (placement.verified === true) {
    return true
  }

  return placement.healthState === 'healthy'
}
