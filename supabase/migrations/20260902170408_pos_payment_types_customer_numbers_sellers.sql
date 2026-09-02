-- POS: separate the kind of booking from the final payment state.
alter table public.pos_sales
  add column if not exists payment_type text not null default 'anticipo',
  add column if not exists payment_status text not null default 'pagado',
  add column if not exists advance_amount numeric not null default 500,
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists payment_installments smallint;

alter table public.pos_sales drop constraint if exists pos_sales_payment_type_check;
alter table public.pos_sales add constraint pos_sales_payment_type_check
  check (payment_type in ('anticipo', 'garantia', 'sin_anticipo'));

alter table public.pos_sales drop constraint if exists pos_sales_payment_status_check;
alter table public.pos_sales add constraint pos_sales_payment_status_check
  check (payment_status in ('anticipo', 'anticipo_pagado', 'pendiente', 'garantia', 'pagado'));

alter table public.pos_sales drop constraint if exists pos_sales_payment_method_check;
alter table public.pos_sales add constraint pos_sales_payment_method_check
  check (payment_method in ('efectivo', 'tarjeta', 'transferencia', 'bill_packet'));

alter table public.pos_sales drop constraint if exists pos_sales_subtotal_check;
alter table public.pos_sales add constraint pos_sales_subtotal_check check (subtotal >= 0);
alter table public.pos_sales drop constraint if exists pos_sales_total_check;
alter table public.pos_sales add constraint pos_sales_total_check check (total >= 0);
alter table public.pos_sales drop constraint if exists pos_sales_payment_installments_check;
alter table public.pos_sales add constraint pos_sales_payment_installments_check
  check (payment_installments is null or payment_installments in (3, 6));

update public.pos_sales
set payment_type = case
  when coalesce(payment_status, 'pagado') = 'garantia' then 'garantia'
  when coalesce(payment_status, 'pagado') = 'pendiente' then 'sin_anticipo'
  else 'anticipo'
end
where payment_type is null;

update public.pos_sales
set paid_amount = total
where payment_status = 'pagado' and coalesce(paid_amount, 0) = 0;

-- Every customer receives one stable, six-digit numeric identifier.
alter table public.customers add column if not exists customer_number text;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'customer_number'
      and data_type <> 'text'
  ) then
    alter table public.customers alter column customer_number drop default;
    alter table public.customers
      alter column customer_number type text
      using lpad(customer_number::text, 6, '0');
  end if;
end $$;

alter table public.customers alter column customer_number drop default;

do $$
declare
  customer_row record;
  candidate text;
begin
  for customer_row in select id from public.customers where customer_number is null loop
    loop
      candidate := lpad(floor(random() * 1000000)::bigint::text, 6, '0');
      exit when not exists (select 1 from public.customers where customer_number = candidate);
    end loop;
    update public.customers set customer_number = candidate where id = customer_row.id;
  end loop;
end $$;

create unique index if not exists customers_customer_number_key on public.customers(customer_number);

create or replace function public.assign_customer_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  candidate text;
begin
  if new.customer_number is null or new.customer_number = '' then
    loop
      candidate := lpad(floor(random() * 1000000)::bigint::text, 6, '0');
      exit when not exists (select 1 from public.customers where customer_number = candidate);
    end loop;
    new.customer_number := candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_assign_number on public.customers;
create trigger customers_assign_number
before insert on public.customers
for each row execute function public.assign_customer_number();

alter table public.customers alter column customer_number set not null;
alter table public.customers drop constraint if exists customers_customer_number_format_check;
alter table public.customers add constraint customers_customer_number_format_check
  check (customer_number ~ '^[0-9]{6}$');

-- Seller profiles are managed by the account owner. Auth users are created by the edge function below.
create table if not exists public.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  username text not null,
  email text not null,
  display_name text not null,
  permissions jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, username),
  unique (owner_user_id, email)
);
alter table public.seller_profiles enable row level security;
drop policy if exists seller_profiles_owner_all on public.seller_profiles;
create policy seller_profiles_owner_all on public.seller_profiles for all to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));
drop policy if exists seller_profiles_self_read on public.seller_profiles;
create policy seller_profiles_self_read on public.seller_profiles for select to authenticated
  using (auth_user_id = (select auth.uid()));
grant select, insert, update, delete on public.seller_profiles to authenticated;

create index if not exists pos_sales_payment_type_idx on public.pos_sales(payment_type);

-- A seller authenticates with its own Auth user but works inside the owner's CRM account.
create or replace function public.crm_account_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select seller.owner_user_id
     from public.seller_profiles seller
     where seller.auth_user_id = (select auth.uid())
       and seller.active
     limit 1),
    (select auth.uid())
  );
$$;
revoke all on function public.crm_account_owner_id() from public, anon;
grant execute on function public.crm_account_owner_id() to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['customers', 'appointments', 'notifications', 'cash_sessions', 'pos_sales', 'customer_service_history', 'appointment_email_logs', 'treatments', 'app_settings']
  loop
    execute format('alter table public.%I alter column owner_user_id set default public.crm_account_owner_id()', target_table);
  end loop;
end;
$$;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('customers', 'appointments', 'notifications', 'cash_sessions', 'pos_sales', 'customer_service_history', 'appointment_email_logs', 'treatments', 'app_settings', 'pos_sale_items')
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end;
$$;

create policy customers_account_all on public.customers for all to authenticated
  using (owner_user_id = (select public.crm_account_owner_id()))
  with check (owner_user_id = (select public.crm_account_owner_id()));
create policy appointments_account_all on public.appointments for all to authenticated
  using (owner_user_id = (select public.crm_account_owner_id()))
  with check (owner_user_id = (select public.crm_account_owner_id()));
create policy notifications_account_all on public.notifications for all to authenticated
  using (owner_user_id = (select public.crm_account_owner_id()))
  with check (owner_user_id = (select public.crm_account_owner_id()));
create policy cash_sessions_account_all on public.cash_sessions for all to authenticated
  using (owner_user_id = (select public.crm_account_owner_id()))
  with check (owner_user_id = (select public.crm_account_owner_id()));
create policy pos_sales_account_all on public.pos_sales for all to authenticated
  using (owner_user_id = (select public.crm_account_owner_id()))
  with check (owner_user_id = (select public.crm_account_owner_id()));
create policy customer_service_history_account_all on public.customer_service_history for all to authenticated
  using (owner_user_id = (select public.crm_account_owner_id()))
  with check (owner_user_id = (select public.crm_account_owner_id()));
create policy appointment_email_logs_account_all on public.appointment_email_logs for all to authenticated
  using (owner_user_id = (select public.crm_account_owner_id()))
  with check (owner_user_id = (select public.crm_account_owner_id()));
create policy treatments_account_all on public.treatments for all to authenticated
  using (owner_user_id = (select public.crm_account_owner_id()))
  with check (owner_user_id = (select public.crm_account_owner_id()));
create policy app_settings_account_all on public.app_settings for all to authenticated
  using (owner_user_id = (select public.crm_account_owner_id()))
  with check (owner_user_id = (select public.crm_account_owner_id()));
create policy pos_sale_items_account_all on public.pos_sale_items for all to authenticated
  using (exists (select 1 from public.pos_sales sale where sale.id = pos_sale_items.sale_id and sale.owner_user_id = (select public.crm_account_owner_id())))
  with check (exists (select 1 from public.pos_sales sale where sale.id = pos_sale_items.sale_id and sale.owner_user_id = (select public.crm_account_owner_id())));
