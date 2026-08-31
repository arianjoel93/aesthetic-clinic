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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
  before update on public.services
  for each row
  execute function public.set_updated_at();

alter table public.services enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'services' and policyname = 'Allow services read') then
    create policy "Allow services read" on public.services for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'services' and policyname = 'Allow services insert') then
    create policy "Allow services insert" on public.services for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'services' and policyname = 'Allow services update') then
    create policy "Allow services update" on public.services for update using (true) with check (true);
  end if;
end $$;

grant select, insert, update on public.services to anon, authenticated;

alter table public.pos_sale_items add column if not exists service_id uuid references public.services(id) on delete set null;
create index if not exists pos_sale_items_service_id_idx on public.pos_sale_items(service_id);
grant select, insert on public.pos_sale_items to anon, authenticated;

do $$
declare
  service_names text[][] := array[
    array['Micropigmentación - Reconstrucción', 'Micropigmentación'],
    array['Micropigmentación - Ojos', 'Micropigmentación'],
    array['Micropigmentación - Cejas', 'Micropigmentación'],
    array['Micropigmentación - Labios', 'Micropigmentación'],
    array['Botox', 'Inyectables'],
    array['Relleno de ácido hialurónico - Relleno de labios', 'Relleno de ácido hialurónico'],
    array['Relleno de ácido hialurónico - Líneas de expresión', 'Relleno de ácido hialurónico'],
    array['Spa', 'Spa'],
    array['Faciales', 'Faciales'],
    array['ADN salmón', 'Tratamientos'],
    array['Enzimas', 'Tratamientos'],
    array['Maquillaje - Social', 'Maquillaje'],
    array['Maquillaje - 15 años', 'Maquillaje'],
    array['Maquillaje - Nupcial', 'Maquillaje'],
    array['Peinado - Social', 'Peinado'],
    array['Peinado - 15 años', 'Peinado'],
    array['Peinado - Nupcial', 'Peinado'],
    array['Maquillaje y peinado - Social', 'Maquillaje y peinado'],
    array['Maquillaje y peinado - 15 años', 'Maquillaje y peinado'],
    array['Maquillaje y peinado - Nupcial', 'Maquillaje y peinado'],
    array['Seminario / Curso de automaquillaje', 'Formación']
  ];
  item text[];
begin
  foreach item slice 1 in array service_names loop
    if not exists (select 1 from public.services where lower(name) = lower(item[1])) then
      insert into public.services (name, category, price, active)
      values (item[1], item[2], 0, true);
    end if;
  end loop;
end $$;
