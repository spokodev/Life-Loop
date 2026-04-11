create table if not exists hosted_staging_objects (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references libraries(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  object_key text not null unique,
  filename text not null,
  content_type text,
  checksum_sha256 text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_bytes bigint not null default 0 check (uploaded_bytes >= 0),
  status text not null check (
    status in ('reserved', 'uploading', 'staged', 'archiving', 'verified', 'blocked', 'expired')
  ),
  expires_at timestamptz not null,
  retention_eligible_at timestamptz,
  completed_at timestamptz,
  blocked_reason text,
  safe_error_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hosted_staging_objects_library_status_idx
  on hosted_staging_objects (library_id, status, expires_at);

create index if not exists hosted_staging_objects_device_idx
  on hosted_staging_objects (device_id, created_at desc);
