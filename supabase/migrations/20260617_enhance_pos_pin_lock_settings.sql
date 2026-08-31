create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "Allow settings read" on public.app_settings for select using (true);
create policy "Allow settings insert" on public.app_settings for insert with check (true);
create policy "Allow settings update" on public.app_settings for update using (true) with check (true);

alter table public.cash_sessions
  add column if not exists pos_locked boolean not null default false;

create index if not exists pos_sales_created_at_idx on public.pos_sales(created_at desc);
create index if not exists pos_sales_customer_id_idx on public.pos_sales(customer_id);
create index if not exists pos_sale_items_treatment_id_idx on public.pos_sale_items(treatment_id);
