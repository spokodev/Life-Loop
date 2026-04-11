alter table job_runs
  add column if not exists claimed_by_device_id uuid references devices(id) on delete set null,
  add column if not exists lease_token_hash text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists job_runs_claimable_idx
  on job_runs (library_id, status, updated_at)
  where status in ('queued', 'retrying');

create index if not exists job_runs_running_lease_idx
  on job_runs (library_id, lease_expires_at)
  where status = 'running';
