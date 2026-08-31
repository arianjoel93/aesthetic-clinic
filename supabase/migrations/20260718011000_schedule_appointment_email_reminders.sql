create extension if not exists pg_cron;
create extension if not exists pg_net;

do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'appointment-email-reminders-daily') then
    perform cron.unschedule('appointment-email-reminders-daily');
  end if;

  perform cron.schedule(
    'appointment-email-reminders-daily',
    '0 15 * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'crm_project_url'
          order by created_at desc
          limit 1
        ) || '/functions/v1/appointment-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'crm_publishable_key'
            order by created_at desc
            limit 1
          ),
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'crm_publishable_key'
            order by created_at desc
            limit 1
          )
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end
$schedule$;
