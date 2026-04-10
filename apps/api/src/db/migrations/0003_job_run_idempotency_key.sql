alter table job_runs
  add column if not exists idempotency_key text;

create unique index if not exists job_runs_idempotency_key_idx
  on job_runs(idempotency_key)
  where idempotency_key is not null;
