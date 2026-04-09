# 03. Domain Model

## Core entities
- User
- Organization (future)
- Library
- Device
- StorageTarget
- Asset
- Blob
- Version
- Placement
- JobRun
- AuditEvent

## Important modeling rule
A Live Photo is one logical Asset that may have two Blobs.

## Asset lifecycle states
- discovered
- ingested
- hashed
- normalized
- archived_primary_pending_verify
- archived_primary_verified
- archived_replica_pending_verify
- archived_replica_verified
- safe_archived
- selected_online_published
- cleanup_eligible
- cleanup_confirmed
- manual_review

## Storage roles
- archive-primary
- archive-replica
- preview-store
- selected-online
- transfer-cache

## Safety invariant
A phone asset is never cleanup-eligible until the policy requirements for durable verified placements have been met.
