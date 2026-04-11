import { randomUUID } from 'node:crypto'

export const hostedStagingPolicy = {
  maxObjectBytes: 2 * 1024 * 1024 * 1024,
  maxPendingBytesPerLibrary: 25 * 1024 * 1024 * 1024,
  maxPendingObjectsPerLibrary: 500,
  reservationExpiryHours: 24,
  completedRetentionDays: 7,
  postArchiveRetentionEligibilityHours: 24,
} as const

export type HostedStagingQuotaInput = {
  requestedSizeBytes: number
  pendingBytes: number
  pendingObjectCount: number
}

export function assertHostedStagingQuota(input: HostedStagingQuotaInput) {
  if (input.requestedSizeBytes > hostedStagingPolicy.maxObjectBytes) {
    throw new Error('Hosted staging object exceeds the MVP 2 GiB object limit.')
  }

  if (input.pendingObjectCount + 1 > hostedStagingPolicy.maxPendingObjectsPerLibrary) {
    throw new Error('Hosted staging object quota exceeded for this library.')
  }

  if (
    BigInt(input.pendingBytes) + BigInt(input.requestedSizeBytes) >
    BigInt(hostedStagingPolicy.maxPendingBytesPerLibrary)
  ) {
    throw new Error('Hosted staging byte quota exceeded for this library.')
  }
}

export function createHostedStagingObjectKey(input: {
  libraryId: string
  stagingObjectId?: string
}) {
  const stagingObjectId = input.stagingObjectId ?? randomUUID()
  return {
    stagingObjectId,
    objectKey: `${input.libraryId}/${stagingObjectId}`,
  }
}

export function createReservationExpiry(now = new Date()) {
  return addHours(now, hostedStagingPolicy.reservationExpiryHours).toISOString()
}

export function createCompletedRetentionExpiry(now = new Date()) {
  return addDays(now, hostedStagingPolicy.completedRetentionDays).toISOString()
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}
