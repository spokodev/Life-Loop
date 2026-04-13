do $$
declare
  fk_name text;
begin
  for fk_name in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'restore_drill_evidence'::regclass
      and c.contype = 'f'
      and a.attname = 'asset_id'
  loop
    execute format('alter table restore_drill_evidence drop constraint %I', fk_name);
  end loop;

  delete from restore_drill_evidence where asset_id is null;

  alter table restore_drill_evidence
    alter column asset_id set not null,
    add constraint restore_drill_evidence_asset_id_fkey
      foreign key (asset_id)
      references assets(id)
      on delete cascade;
end $$;
