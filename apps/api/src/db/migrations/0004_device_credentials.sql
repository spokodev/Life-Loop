create table if not exists device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  secret_hash text not null,
  status text not null check (status in ('active', 'rotated', 'revoked')),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_credentials_device_id_idx on device_credentials(device_id);

create unique index if not exists device_credentials_active_device_idx
  on device_credentials(device_id)
  where status = 'active';

alter table device_enrollment_tokens
  add column if not exists consumed_credential_id uuid references device_credentials(id) on delete set null;
