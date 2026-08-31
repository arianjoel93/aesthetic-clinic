create extension if not exists pgcrypto with schema extensions;

insert into public.app_settings (key, value)
values
  ('module_admin_locks', '{}'),
  ('profile_change_history', '[]'),
  ('admin_access_pin_hash', encode(extensions.digest('0000', 'sha256'), 'hex')),
  ('admin_pin_requires_change', 'true')
on conflict (key) do nothing;

create or replace function public.enqueue_tomorrow_appointment_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.notifications (
    appointment_id,
    title,
    message,
    kind,
    target_date,
    read,
    dedupe_key
  )
  select
    appointment.id,
    'Cita de mañana',
    coalesce(appointment.customer_name, 'Cliente') || ' - '
      || coalesce(appointment.service, 'Servicio')
      || case when nullif(trim(appointment.service_subtype), '') is null then '' else ' - ' || appointment.service_subtype end
      || ' a las ' || left(appointment.start_time::text, 5),
    'tomorrow_reminder',
    appointment.appointment_date,
    false,
    'appointment:' || appointment.id || ':tomorrow:' || appointment.appointment_date
  from public.appointments appointment
  where appointment.appointment_date = current_date + 1
    and appointment.status not in ('rechazada', 'cancelada', 'completada')
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.enqueue_tomorrow_appointment_notifications() from public, anon, authenticated;
grant execute on function public.enqueue_tomorrow_appointment_notifications() to service_role;

select public.enqueue_tomorrow_appointment_notifications();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'crm-tomorrow-notifications') then
      perform cron.unschedule('crm-tomorrow-notifications');
    end if;
    perform cron.schedule(
      'crm-tomorrow-notifications',
      '15 * * * *',
      'select public.enqueue_tomorrow_appointment_notifications();'
    );
  end if;
end
$$;
