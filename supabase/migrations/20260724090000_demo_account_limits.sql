create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.services
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  add column if not exists is_shared boolean not null default false;

do $$
declare
  primary_user_id uuid;
begin
  select id
    into primary_user_id
  from auth.users
  where lower(email) = 'info@danielarodriguez.com.mx'
  limit 1;

  if primary_user_id is null then
    raise exception 'Primary CRM account was not found';
  end if;

  update public.services
  set owner_user_id = primary_user_id,
      is_shared = true
  where owner_user_id is null;
end;
$$;

alter table public.services
  alter column owner_user_id set default auth.uid(),
  alter column owner_user_id set not null;

create index if not exists services_owner_user_id_idx
  on public.services(owner_user_id);

drop index if exists public.services_name_lower_unique_idx;
create unique index if not exists services_shared_name_unique_idx
  on public.services(lower(name))
  where is_shared;
create unique index if not exists services_owner_name_unique_idx
  on public.services(owner_user_id, lower(name))
  where not is_shared;

create or replace function private.prevent_service_scope_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
    or new.is_shared is distinct from old.is_shared then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_SCOPE_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_service_scope_change on public.services;
create trigger prevent_service_scope_change
  before update on public.services
  for each row execute function private.prevent_service_scope_change();

create or replace function private.enforce_demo_insert_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_email text;
  current_count integer;
begin
  if new.owner_user_id is null then
    return new;
  end if;

  select lower(email)
    into account_email
  from auth.users
  where id = new.owner_user_id;

  if account_email is null or account_email not like '%@demo.com' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.owner_user_id::text || ':' || tg_table_name, 0)
  );

  if tg_table_name = 'customers' then
    select count(*)
      into current_count
    from public.customers
    where owner_user_id = new.owner_user_id;

    if current_count >= 1 then
      raise exception using
        errcode = 'P0001',
        message = 'DEMO_LIMIT_CUSTOMERS';
    end if;
  elsif tg_table_name = 'pos_sales' then
    select count(*)
      into current_count
    from public.pos_sales
    where owner_user_id = new.owner_user_id;

    if current_count >= 5 then
      raise exception using
        errcode = 'P0001',
        message = 'DEMO_LIMIT_POS_SALES';
    end if;
  elsif tg_table_name = 'services' then
    select count(*)
      into current_count
    from public.services
    where owner_user_id = new.owner_user_id
      and not is_shared;

    if current_count >= 3 then
      raise exception using
        errcode = 'P0001',
        message = 'DEMO_LIMIT_SERVICES';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_service_scope_change() from public, anon, authenticated;
revoke all on function private.enforce_demo_insert_limits() from public, anon, authenticated;

drop trigger if exists enforce_demo_customer_limit on public.customers;
create trigger enforce_demo_customer_limit
  before insert on public.customers
  for each row execute function private.enforce_demo_insert_limits();

drop trigger if exists enforce_demo_pos_sales_limit on public.pos_sales;
create trigger enforce_demo_pos_sales_limit
  before insert on public.pos_sales
  for each row execute function private.enforce_demo_insert_limits();

drop trigger if exists enforce_demo_services_limit on public.services;
create trigger enforce_demo_services_limit
  before insert on public.services
  for each row execute function private.enforce_demo_insert_limits();

drop policy if exists "Authenticated services read" on public.services;
drop policy if exists "Authenticated services insert" on public.services;
drop policy if exists "Authenticated services update" on public.services;
drop policy if exists "Authenticated services delete" on public.services;

create policy services_visible_catalog_or_owner
  on public.services for select
  to authenticated
  using (
    is_shared
    or owner_user_id = (select auth.uid())
  );

create policy services_insert_owner_only
  on public.services for insert
  to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and not is_shared
  );

create policy services_update_owner_only
  on public.services for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy services_delete_owner_only
  on public.services for delete
  to authenticated
  using (owner_user_id = (select auth.uid()));

