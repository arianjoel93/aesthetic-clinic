create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company text not null default 'Particular',
  email text,
  phone text,
  whatsapp text,
  rfc text,
  profile_image_url text,
  status text not null default 'prospecto' check (status in ('activo', 'prospecto', 'inactivo')),
  owner text not null default 'Administrador',
  service_type text,
  birth_date date,
  gender text check (gender is null or gender in ('femenino', 'masculino', 'otro')),
  address text,
  preferred_schedule text,
  first_visit_date date,
  referred_by text,
  medical_alerts text,
  notes text,
  allergies text[] not null default '{}',
  surgeries text[] not null default '{}',
  diseases text[] not null default '{}',
  previous_procedures text,
  thyroid_issues text check (thyroid_issues is null or thyroid_issues in ('si', 'no', '')),
  body_products text,
  previous_botox_or_substance text check (previous_botox_or_substance is null or previous_botox_or_substance in ('si', 'no', '')),
  previous_substance_details text,
  secondary_reactions text check (secondary_reactions is null or secondary_reactions in ('si', 'no', '')),
  seafood_allergy text check (seafood_allergy is null or seafood_allergy in ('si', 'no', '')),
  seafood_allergy_details text,
  healing_problems text check (healing_problems is null or healing_problems in ('si', 'no', '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_full_name_idx on public.customers (full_name);
create index if not exists customers_status_idx on public.customers (status);
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at before update on public.contacts for each row execute function public.set_updated_at();

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  customer_id uuid references public.customers(id) on delete set null,
  stage text not null default 'nuevo' check (stage in ('nuevo', 'contactado', 'propuesta', 'negociacion', 'ganado', 'perdido')),
  value numeric not null default 0,
  probability numeric not null default 0,
  owner text,
  next_step text,
  expected_close date,
  priority text not null default 'media' check (priority in ('baja', 'media', 'alta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads for each row execute function public.set_updated_at();

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  title text not null,
  type text not null default 'tarea' check (type in ('llamada', 'correo', 'reunion', 'tarea')),
  due_date date,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at before update on public.activities for each row execute function public.set_updated_at();

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  title text not null,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at before update on public.notes for each row execute function public.set_updated_at();

create table if not exists public.treatments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  base_price numeric not null default 0 check (base_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists treatments_name_lower_unique_idx on public.treatments (lower(name));
drop trigger if exists treatments_set_updated_at on public.treatments;
create trigger treatments_set_updated_at before update on public.treatments for each row execute function public.set_updated_at();

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  price numeric not null default 0 check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists services_name_lower_unique_idx on public.services (lower(name));
create index if not exists services_active_name_idx on public.services (active, name);
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_whatsapp text,
  service text not null,
  service_subtype text,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'creada' check (status in ('creada', 'enviada', 'aceptada', 'rechazada', 'reagendada', 'completada', 'cancelada')),
  cost numeric not null default 0 check (cost >= 0),
  discount_percent numeric not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  auto_generated boolean not null default false,
  parent_appointment_id uuid references public.appointments(id) on delete set null,
  confirmation_token text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_date_start_idx on public.appointments (appointment_date, start_time);
create index if not exists appointments_status_idx on public.appointments (status);
drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  title text not null,
  message text not null,
  kind text not null default 'general',
  target_date date not null default current_date,
  read boolean not null default false,
  dedupe_key text,
  created_at timestamptz not null default now()
);
create unique index if not exists notifications_dedupe_key_unique_idx on public.notifications (dedupe_key) where dedupe_key is not null;
create index if not exists notifications_read_created_idx on public.notifications (read, created_at desc);
create index if not exists notifications_appointment_idx on public.notifications (appointment_id);

create table if not exists public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text not null default 'Daniela',
  last_name text not null default 'Rodriguez',
  address text,
  avatar_url text,
  company_name text not null default 'Daniela Makeup Artist',
  password_hash text,
  role text not null default 'Administrador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists admin_profiles_set_updated_at on public.admin_profiles;
create trigger admin_profiles_set_updated_at before update on public.admin_profiles for each row execute function public.set_updated_at();

create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  user_name text not null,
  opening_amount numeric not null default 0 check (opening_amount >= 0),
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  pos_locked boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists one_open_cash_session_idx on public.cash_sessions ((status)) where status = 'abierta';

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
  payment_method text not null default 'efectivo' check (payment_method in ('efectivo', 'tarjeta', 'transferencia'))
);
create index if not exists pos_sales_created_at_idx on public.pos_sales(created_at desc);
create index if not exists pos_sales_customer_id_idx on public.pos_sales(customer_id);

create table if not exists public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  treatment_id uuid references public.treatments(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  total numeric not null default 0 check (total >= 0)
);
create index if not exists pos_sale_items_treatment_id_idx on public.pos_sale_items(treatment_id);
create index if not exists pos_sale_items_service_id_idx on public.pos_sale_items(service_id);

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

create or replace function public.get_admin_profile(p_email text)
returns table (
  email text,
  first_name text,
  last_name text,
  address text,
  avatar_url text,
  company_name text,
  role text
)
language sql
as $$
  select ap.email, ap.first_name, ap.last_name, ap.address, ap.avatar_url, ap.company_name, ap.role
  from public.admin_profiles ap
  where lower(ap.email) = lower(p_email)
  limit 1;
$$;

create or replace function public.update_admin_profile(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_address text,
  p_avatar_url text,
  p_company_name text
)
returns boolean
language plpgsql
as $$
begin
  insert into public.admin_profiles (email, first_name, last_name, address, avatar_url, company_name)
  values (lower(p_email), coalesce(p_first_name, 'Daniela'), coalesce(p_last_name, 'Rodriguez'), p_address, p_avatar_url, coalesce(p_company_name, 'Daniela Makeup Artist'))
  on conflict (email) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    address = excluded.address,
    avatar_url = excluded.avatar_url,
    company_name = excluded.company_name,
    updated_at = now();
  return true;
end;
$$;

create or replace function public.update_admin_password(p_email text, p_password text)
returns boolean
language plpgsql
as $$
begin
  if p_password is null or length(p_password) < 8 then
    return false;
  end if;

  insert into public.admin_profiles (email, password_hash)
  values (lower(p_email), crypt(p_password, gen_salt('bf')))
  on conflict (email) do update set
    password_hash = crypt(p_password, gen_salt('bf')),
    updated_at = now();
  return true;
end;
$$;

create or replace function public.enqueue_notification(
  p_appointment_id uuid,
  p_title text,
  p_message text,
  p_kind text,
  p_target_date date,
  p_dedupe_key text
)
returns void
language sql
as $$
  insert into public.notifications (appointment_id, title, message, kind, target_date, dedupe_key)
  values (p_appointment_id, p_title, p_message, p_kind, coalesce(p_target_date, current_date), p_dedupe_key)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
$$;

create or replace function public.notify_appointment_changes()
returns trigger
language plpgsql
as $$
declare
  appointment_label text;
begin
  appointment_label := coalesce(new.customer_name, 'Cliente') || ' - ' || coalesce(new.service, 'Servicio') || ' (' || new.appointment_date || ' ' || left(new.start_time::text, 5) || ')';

  if tg_op = 'INSERT' then
    perform public.enqueue_notification(new.id, 'Nueva cita', appointment_label, 'appointment_created', new.appointment_date, 'appointment:' || new.id || ':created');
    return new;
  end if;

  if old.appointment_date is distinct from new.appointment_date or old.start_time is distinct from new.start_time or old.end_time is distinct from new.end_time then
    perform public.enqueue_notification(new.id, 'Cita reprogramada', coalesce(new.customer_name, 'Cliente') || ': ' || old.appointment_date || ' ' || left(old.start_time::text, 5) || ' -> ' || new.appointment_date || ' ' || left(new.start_time::text, 5), 'appointment_rescheduled', new.appointment_date, 'appointment:' || new.id || ':rescheduled:' || new.appointment_date || ':' || left(new.start_time::text, 5) || ':' || left(new.end_time::text, 5));
  end if;

  if old.status is distinct from new.status then
    perform public.enqueue_notification(new.id, 'Estado de cita actualizado', coalesce(new.customer_name, 'Cliente') || ': ' || new.status, 'appointment_status_changed', new.appointment_date, 'appointment:' || new.id || ':status:' || new.status);
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_notify_changes on public.appointments;
create trigger appointments_notify_changes after insert or update on public.appointments for each row execute function public.notify_appointment_changes();

alter table public.customers enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;
alter table public.notes enable row level security;
alter table public.treatments enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;

do $$
declare
  target_table text;
  policy_name text;
begin
  foreach target_table in array array['customers','contacts','leads','activities','notes','treatments','services','appointments','notifications','admin_profiles','app_settings','cash_sessions','pos_sales','pos_sale_items'] loop
    policy_name := 'Allow ' || target_table || ' read';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = policy_name) then
      execute format('create policy %I on public.%I for select using (true)', policy_name, target_table);
    end if;

    policy_name := 'Allow ' || target_table || ' insert';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = policy_name) then
      execute format('create policy %I on public.%I for insert with check (true)', policy_name, target_table);
    end if;

    policy_name := 'Allow ' || target_table || ' update';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = policy_name) then
      execute format('create policy %I on public.%I for update using (true) with check (true)', policy_name, target_table);
    end if;

    policy_name := 'Allow ' || target_table || ' delete';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = policy_name) then
      execute format('create policy %I on public.%I for delete using (true)', policy_name, target_table);
    end if;
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on function public.next_pos_folio() to anon, authenticated;
grant execute on function public.get_admin_profile(text) to anon, authenticated;
grant execute on function public.update_admin_profile(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.update_admin_password(text, text) to anon, authenticated;

insert into public.app_settings (key, value)
values ('company_name', 'Daniela Makeup Artist')
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public.services (name, category, price, active)
values
  ('Micropigmentación - Reconstrucción', 'Micropigmentación', 0, true),
  ('Micropigmentación - Ojos', 'Micropigmentación', 0, true),
  ('Micropigmentación - Cejas', 'Micropigmentación', 0, true),
  ('Micropigmentación - Labios', 'Micropigmentación', 0, true),
  ('Botox', 'Inyectables', 0, true),
  ('Relleno de ácido hialurónico - Relleno de labios', 'Relleno de ácido hialurónico', 0, true),
  ('Relleno de ácido hialurónico - Líneas de expresión', 'Relleno de ácido hialurónico', 0, true),
  ('Spa', 'Spa', 0, true),
  ('Faciales', 'Faciales', 0, true),
  ('ADN salmón', 'Tratamientos', 0, true),
  ('Enzimas', 'Tratamientos', 0, true),
  ('Maquillaje - Social', 'Maquillaje', 0, true),
  ('Maquillaje - 15 años', 'Maquillaje', 0, true),
  ('Maquillaje - Nupcial', 'Maquillaje', 0, true),
  ('Peinado - Social', 'Peinado', 0, true),
  ('Peinado - 15 años', 'Peinado', 0, true),
  ('Peinado - Nupcial', 'Peinado', 0, true),
  ('Maquillaje y peinado - Social', 'Maquillaje y peinado', 0, true),
  ('Maquillaje y peinado - 15 años', 'Maquillaje y peinado', 0, true),
  ('Maquillaje y peinado - Nupcial', 'Maquillaje y peinado', 0, true),
  ('Seminario / Curso de automaquillaje', 'Formación', 0, true)
on conflict ((lower(name))) do update set category = excluded.category, active = excluded.active, updated_at = now();

insert into public.treatments (name, category, base_price, active)
select name, category, price, active from public.services
on conflict ((lower(name))) do nothing;

insert into public.customers (id, full_name, company, email, phone, whatsapp, status, owner, created_at)
values
  ('10000000-0000-0000-0000-000000000001', 'Mariana Lopez', 'Particular', 'mariana@crm.local', '+52 33 1234 5678', '+52 33 1234 5678', 'activo', 'Lucia Herrera', '2026-05-02'),
  ('10000000-0000-0000-0000-000000000002', 'Carlos Rivera', 'Particular', 'carlos@crm.local', '+52 33 2222 8899', '+52 33 2222 8899', 'prospecto', 'Lucia Herrera', '2026-05-04'),
  ('10000000-0000-0000-0000-000000000003', 'Daniela Torres', 'Particular', 'daniela@crm.local', '+52 33 9191 1010', '+52 33 9191 1010', 'prospecto', 'Lucia Herrera', '2026-05-06'),
  ('10000000-0000-0000-0000-000000000004', 'Ivan Medina', 'Particular', 'ivan@crm.local', '+52 33 8080 4545', '+52 33 8080 4545', 'inactivo', 'Lucia Herrera', '2026-05-08')
on conflict (id) do nothing;

insert into public.appointments (id, customer_id, customer_name, customer_email, customer_whatsapp, service, appointment_date, start_time, end_time, status, cost, discount_percent, confirmation_token)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mariana Lopez', 'mariana@crm.local', '+523312345678', 'Limpieza facial profunda', '2026-05-13', '09:00', '10:00', 'aceptada', 0, 0, 'token-apt-001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Carlos Rivera', 'carlos@crm.local', '+523322228899', 'Depilación láser', '2026-05-13', '12:30', '13:30', 'enviada', 0, 10, 'token-apt-002'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Daniela Torres', 'daniela@crm.local', '+523391911010', 'Ácido hialurónico', '2026-05-14', '10:00', '11:00', 'completada', 3500, 0, 'token-apt-003'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Mariana Lopez', 'mariana@crm.local', '+523312345678', 'Radiofrecuencia facial', '2026-05-15', '16:00', '17:00', 'aceptada', 0, 5, 'token-apt-004')
on conflict (id) do nothing;

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.appointments;
  exception when duplicate_object then null;
  end;
end $$;

