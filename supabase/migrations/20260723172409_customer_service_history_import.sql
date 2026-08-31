alter table public.customers
  add column if not exists preferred_contact_channel text,
  add column if not exists owner_name text;

update public.customers
set owner_name = coalesce(nullif(owner_name, ''), owner)
where owner_name is null or trim(owner_name) = '';

update public.customers
set preferred_contact_channel = case
  when nullif(trim(email), '') is not null then 'email'
  when nullif(trim(coalesce(whatsapp, phone)), '') is not null then 'whatsapp'
  else null
end
where preferred_contact_channel is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_preferred_contact_channel_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_preferred_contact_channel_check
      check (
        preferred_contact_channel is null
        or preferred_contact_channel in ('email', 'whatsapp')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_contact_required_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_contact_required_check
      check (
        nullif(trim(email), '') is not null
        or nullif(trim(coalesce(whatsapp, phone)), '') is not null
      ) not valid;
  end if;
end
$$;

create table if not exists public.customer_service_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  service_date date,
  amount numeric check (amount is null or amount >= 0),
  payment_status text not null default 'sin_registro'
    check (payment_status in ('sin_registro', 'pendiente', 'pagado')),
  payment_method text
    check (payment_method is null or payment_method in ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  receipt_folio text,
  receipt_sent_at timestamptz,
  receipt_email text,
  notes text,
  source_type text not null default 'manual'
    check (source_type in ('importacion', 'manual')),
  source_reference text,
  import_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_service_history_customer_date_idx
  on public.customer_service_history(customer_id, service_date desc, created_at desc);

create index if not exists customer_service_history_service_id_idx
  on public.customer_service_history(service_id);

drop trigger if exists customer_service_history_set_updated_at
  on public.customer_service_history;
create trigger customer_service_history_set_updated_at
  before update on public.customer_service_history
  for each row execute function public.set_updated_at();

alter table public.customer_service_history enable row level security;

drop policy if exists "Authenticated customer history read"
  on public.customer_service_history;
create policy "Authenticated customer history read"
  on public.customer_service_history for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Authenticated customer history insert"
  on public.customer_service_history;
create policy "Authenticated customer history insert"
  on public.customer_service_history for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Authenticated customer history update"
  on public.customer_service_history;
create policy "Authenticated customer history update"
  on public.customer_service_history for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "Authenticated customer history delete"
  on public.customer_service_history;
create policy "Authenticated customer history delete"
  on public.customer_service_history for delete
  to authenticated
  using ((select auth.uid()) is not null);

grant select, insert, update, delete
  on public.customer_service_history to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime
      add table public.customer_service_history;
  exception when duplicate_object then
    null;
  end;
end
$$;
