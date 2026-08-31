create or replace function public.notify_appointment_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_title text;
  notification_message text;
  notification_kind text;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (
      appointment_id, title, message, kind, target_date, sent_email, read, seen_at, dedupe_key
    )
    values (
      new.id,
      'Nueva cita',
      coalesce(new.customer_name, 'Cliente') || ' - ' || coalesce(new.service, 'Servicio')
        || ' (' || new.appointment_date || ' ' || left(new.start_time::text, 5) || ')',
      'appointment_created',
      new.appointment_date,
      false,
      false,
      null,
      'appointment:' || new.id || ':created'
    )
    on conflict (appointment_id, kind)
    do update set
      title = excluded.title,
      message = excluded.message,
      target_date = excluded.target_date,
      dedupe_key = excluded.dedupe_key,
      sent_email = false,
      read = false,
      seen_at = null,
      created_at = now();
    return new;
  end if;

  if (new.appointment_date is distinct from old.appointment_date)
    or (new.start_time is distinct from old.start_time)
    or (new.end_time is distinct from old.end_time) then
    insert into public.notifications (
      appointment_id, title, message, kind, target_date, sent_email, read, seen_at, dedupe_key
    )
    values (
      new.id,
      'Cita reprogramada',
      coalesce(new.customer_name, 'Cliente') || ': '
        || old.appointment_date || ' ' || left(old.start_time::text, 5)
        || ' -> ' || new.appointment_date || ' ' || left(new.start_time::text, 5),
      'appointment_rescheduled',
      new.appointment_date,
      false,
      false,
      null,
      'appointment:' || new.id || ':rescheduled'
    )
    on conflict (appointment_id, kind)
    do update set
      title = excluded.title,
      message = excluded.message,
      target_date = excluded.target_date,
      dedupe_key = excluded.dedupe_key,
      sent_email = false,
      read = false,
      seen_at = null,
      created_at = now();
    return new;
  end if;

  if coalesce(new.status, '') is distinct from coalesce(old.status, '') then
    notification_title := case new.status
      when 'aceptada' then 'Cita confirmada'
      when 'rechazada' then 'Cita rechazada por cliente'
      when 'cancelada' then 'Cita cancelada'
      when 'completada' then 'Cita completada'
      else 'Estado de cita actualizado'
    end;
    notification_kind := case new.status
      when 'aceptada' then 'appointment_confirmed'
      when 'rechazada' then 'appointment_rejected'
      when 'cancelada' then 'appointment_cancelled'
      when 'completada' then 'appointment_completed'
      else 'appointment_status_changed'
    end;
    notification_message := coalesce(new.customer_name, 'Cliente') || ': ' || coalesce(new.status, '');

    insert into public.notifications (
      appointment_id, title, message, kind, target_date, sent_email, read, seen_at, dedupe_key
    )
    values (
      new.id,
      notification_title,
      notification_message,
      notification_kind,
      new.appointment_date,
      false,
      false,
      null,
      'appointment:' || new.id || ':status:' || new.status
    )
    on conflict (appointment_id, kind)
    do update set
      title = excluded.title,
      message = excluded.message,
      target_date = excluded.target_date,
      dedupe_key = excluded.dedupe_key,
      sent_email = false,
      read = false,
      seen_at = null,
      created_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.enqueue_tomorrow_appointment_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  local_today date := (now() at time zone 'America/Mexico_City')::date;
begin
  insert into public.notifications (
    appointment_id, title, message, kind, target_date, read, seen_at, dedupe_key
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
    null,
    'appointment:' || appointment.id || ':tomorrow:' || appointment.appointment_date
  from public.appointments appointment
  where appointment.appointment_date = local_today + 1
    and appointment.status not in ('rechazada', 'cancelada', 'completada')
  on conflict (appointment_id, kind)
  do update set
    title = excluded.title,
    message = excluded.message,
    target_date = excluded.target_date,
    dedupe_key = excluded.dedupe_key,
    read = false,
    seen_at = null,
    created_at = now();

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

alter function public.notify_appointment_events() set search_path = public;
alter function public.enqueue_tomorrow_appointment_notifications() set search_path = public;
revoke all on function public.notify_appointment_events() from public, anon, authenticated;
revoke all on function public.enqueue_tomorrow_appointment_notifications() from public, anon, authenticated;
grant execute on function public.enqueue_tomorrow_appointment_notifications() to service_role;

drop index if exists public.notifications_unique_event;
