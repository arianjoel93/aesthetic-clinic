do $$
begin
  begin
    alter publication supabase_realtime add table public.appointments;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;

create or replace function public.notify_appointment_changes()
returns trigger
language plpgsql
as $$
declare
  appointment_label text;
  status_title text;
  status_message text;
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
    if new.status = 'aceptada' then
      status_title := 'Cita confirmada';
      status_message := coalesce(new.customer_name, 'Cliente') || ' confirmó su cita de ' || coalesce(new.service, 'Servicio') || ' (' || new.appointment_date || ' ' || left(new.start_time::text, 5) || ').';
    elsif new.status = 'rechazada' then
      status_title := 'Cita rechazada por cliente';
      status_message := coalesce(new.customer_name, 'Cliente') || ' rechazó su cita de ' || coalesce(new.service, 'Servicio') || ' (' || new.appointment_date || ' ' || left(new.start_time::text, 5) || ').';
    else
      status_title := 'Estado de cita actualizado';
      status_message := coalesce(new.customer_name, 'Cliente') || ': ' || new.status;
    end if;

    perform public.enqueue_notification(new.id, status_title, status_message, case when new.status = 'aceptada' then 'appointment_confirmed' else 'appointment_status_changed' end, new.appointment_date, 'appointment:' || new.id || ':status:' || new.status);
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_notify_changes on public.appointments;
create trigger appointments_notify_changes after insert or update on public.appointments for each row execute function public.notify_appointment_changes();
