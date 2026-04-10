do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'users'
      and column_name = 'clerk_user_id'
      and is_nullable = 'NO'
  ) then
    alter table users
      alter column clerk_user_id drop not null;
  end if;
end $$;
