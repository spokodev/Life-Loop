create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists libraries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references libraries(id) on delete cascade,
  name text not null,
  platform text not null check (platform in ('macos', 'windows', 'linux', 'ios')),
  status text not null check (status in ('pending', 'active', 'paused', 'revoked')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage_targets (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references libraries(id) on delete cascade,
  name text not null,
  provider text not null,
  role text not null check (
    role in ('archive-primary', 'archive-replica', 'preview-store', 'selected-online', 'transfer-cache')
  ),
  writable boolean not null default true,
  healthy boolean not null default false,
  health_state text not null check (
    health_state in ('healthy', 'verifying', 'degraded', 'stale', 'unavailable', 'needs_review')
  ),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references libraries(id) on delete cascade,
  source_device_id uuid references devices(id) on delete set null,
  filename text not null,
  capture_date timestamptz,
  lifecycle_state text not null check (
    lifecycle_state in (
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
      'manual_review'
    )
  ),
  asset_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  kind text not null check (kind in ('original', 'paired-motion', 'normalized', 'preview')),
  checksum_sha256 text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text,
  created_at timestamptz not null default now()
);

create unique index if not exists blobs_asset_kind_checksum_key
  on blobs(asset_id, kind, checksum_sha256);

create table if not exists asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  version_label text not null,
  status text not null check (status in ('current', 'superseded')),
  created_at timestamptz not null default now()
);

create table if not exists placements (
  id uuid primary key default gen_random_uuid(),
  blob_id uuid not null references blobs(id) on delete cascade,
  storage_target_id uuid not null references storage_targets(id) on delete cascade,
  role text not null check (
    role in ('archive-primary', 'archive-replica', 'preview-store', 'selected-online', 'transfer-cache')
  ),
  checksum_sha256 text not null,
  health_state text not null check (
    health_state in ('healthy', 'verifying', 'degraded', 'stale', 'unavailable', 'needs_review')
  ),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blob_id, storage_target_id)
);

create table if not exists job_runs (
  id uuid primary key default gen_random_uuid(),
  library_id uuid references libraries(id) on delete cascade,
  asset_id uuid references assets(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  kind text not null check (
    kind in (
      'ingest-normalization',
      'archive-placement',
      'placement-verification',
      'replica-sync',
      'selected-online-publish',
      'restore-drill',
      'device-heartbeat',
      'cleanup-review'
    )
  ),
  status text not null check (
    status in (
      'queued',
      'running',
      'retrying',
      'succeeded',
      'completed_with_warnings',
      'failed',
      'cancelled',
      'blocked'
    )
  ),
  correlation_id uuid not null,
  attempt_count integer not null default 0,
  blocking_reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_runs_status_idx on job_runs(status);
create index if not exists job_runs_correlation_id_idx on job_runs(correlation_id);

create table if not exists restore_drills (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references libraries(id) on delete cascade,
  status text not null check (status in ('scheduled', 'running', 'passed', 'failed')),
  sample_size integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  library_id uuid references libraries(id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'device', 'system')),
  actor_id text,
  event_type text not null,
  correlation_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists device_enrollment_tokens (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references devices(id) on delete cascade,
  library_id uuid not null references libraries(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
