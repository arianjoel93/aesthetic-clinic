create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  user_name text not null,
  opening_amount numeric not null default 0 check (opening_amount >= 0),
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  created_at timestamptz not null default now()
);

create unique index if not exists one_open_cash_session_idx
  on public.cash_sessions ((status))
  where status = 'abierta';

create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  created_at timestamptz not null default now(),
  user_name text not null,
  subtotal numeric not null default 0 check (subtotal > 0),
  total numeric not null default 0 check (total > 0),
  payment_method text not null default 'efectivo'
);

create table if not exists public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  treatment_id uuid references public.treatments(id) on delete set null,
  service_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  total numeric not null default 0 check (total >= 0)
);

alter table public.cash_sessions enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;

create policy "Allow POS cash read" on public.cash_sessions for select using (true);
create policy "Allow POS cash insert" on public.cash_sessions for insert with check (true);
create policy "Allow POS cash update" on public.cash_sessions for update using (true) with check (true);
create policy "Allow POS sales read" on public.pos_sales for select using (true);
create policy "Allow POS sales insert" on public.pos_sales for insert with check (true);
create policy "Allow POS sale items read" on public.pos_sale_items for select using (true);
create policy "Allow POS sale items insert" on public.pos_sale_items for insert with check (true);

create or replace function public.next_pos_folio()
returns text
language plpgsql
as $$
declare
  next_number integer;
begin
  select coalesce(max(regexp_replace(folio, '\D', '', 'g')::integer), 0) + 1
    into next_number
  from public.pos_sales
  where folio ~ '^POS-[0-9]+$';

  return 'POS-' || lpad(next_number::text, 5, '0');
end;
$$;
