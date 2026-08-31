create table if not exists public.appointment_email_logs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  kind text not null check (kind in ('confirmation', 'reminder')),
  recipient_email text not null,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.appointment_email_logs enable row level security;

drop policy if exists "appointment email logs read" on public.appointment_email_logs;
create policy "appointment email logs read"
on public.appointment_email_logs
for select
to authenticated
using (true);

drop policy if exists "appointment email logs insert" on public.appointment_email_logs;
create policy "appointment email logs insert"
on public.appointment_email_logs
for insert
to authenticated
with check (true);

grant select, insert on public.appointment_email_logs to authenticated;

-- Recordatorios automáticos:
-- 1) Deploy de la función appointment-reminders.
-- 2) Guardar project_url y publishable_key en Vault.
-- 3) Activar este cron desde SQL Editor si el proyecto tiene pg_cron, pg_net y Vault disponibles.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.unschedule('appointment-reminders-daily');
-- select cron.schedule(
--   'appointment-reminders-daily',
--   '0 9 * * *',
--   $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/appointment-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
