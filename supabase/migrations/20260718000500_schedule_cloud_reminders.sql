create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'crm-tomorrow-notifications') then
    perform cron.unschedule('crm-tomorrow-notifications');
  end if;

  perform cron.schedule(
    'crm-tomorrow-notifications',
    '15 * * * *',
    'select public.enqueue_tomorrow_appointment_notifications();'
  );
end
$$;
