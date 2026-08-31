create table if not exists public.appointment_email_logs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  kind text not null check (kind in ('confirmation', 'reminder')),
  recipient_email text not null,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists appointment_email_logs_appointment_id_idx
on public.appointment_email_logs (appointment_id);

alter table public.appointment_email_logs enable row level security;

drop policy if exists "appointment email logs read" on public.appointment_email_logs;
create policy "appointment email logs read"
on public.appointment_email_logs
for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "appointment email logs insert" on public.appointment_email_logs;
create policy "appointment email logs insert"
on public.appointment_email_logs
for insert
to authenticated
with check ((select auth.uid()) is not null);

grant select, insert on public.appointment_email_logs to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointment_email_logs'
  ) then
    alter publication supabase_realtime add table public.appointment_email_logs;
  end if;
end
$$;
