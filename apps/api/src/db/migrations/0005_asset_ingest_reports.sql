create table if not exists asset_ingest_reports (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references libraries(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  job_run_id uuid not null references job_runs(id) on delete cascade,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists asset_ingest_reports_library_id_idx
  on asset_ingest_reports(library_id);
