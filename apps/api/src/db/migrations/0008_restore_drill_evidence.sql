create table if not exists restore_drill_evidence (
  id uuid primary key default gen_random_uuid(),
  restore_drill_id uuid not null references restore_drills(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  storage_target_id uuid references storage_targets(id) on delete set null,
  candidate_status text not null check (candidate_status in ('ready', 'degraded', 'blocked')),
  evidence_status text not null check (
    evidence_status in ('ready', 'restored', 'verified', 'partial', 'failed', 'blocked')
  ),
  checksum_sha256 text,
  safe_error_class text,
  summary text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restore_drill_id, asset_id)
);

create index if not exists restore_drill_evidence_drill_idx
  on restore_drill_evidence (restore_drill_id, evidence_status);

alter table restore_drill_evidence
  alter column asset_id set not null;
