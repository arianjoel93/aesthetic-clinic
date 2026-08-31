-- Keep operational CRM data private per Supabase Auth user.
-- Services intentionally remain a shared catalog for every authenticated account.

do $$
declare
  primary_user_id uuid;
  table_name text;
begin
  select id
    into primary_user_id
  from auth.users
  where lower(email) = 'info@danielarodriguez.com.mx'
  limit 1;

  if primary_user_id is null then
    raise exception 'Primary CRM account info@danielarodriguez.com.mx was not found';
  end if;

  foreach table_name in array array[
    'customers',
    'appointments',
    'notifications',
    'appointment_move_audit',
    'cash_sessions',
    'pos_sales',
    'customer_service_history',
    'appointment_email_logs',
    'treatments',
    'app_settings'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists owner_user_id uuid references auth.users(id) on delete cascade default auth.uid()',
      table_name
    );
    execute format(
      'update public.%I set owner_user_id = $1 where owner_user_id is null',
      table_name
    ) using primary_user_id;
    execute format(
      'alter table public.%I alter column owner_user_id set default auth.uid()',
      table_name
    );
    execute format(
      'alter table public.%I alter column owner_user_id set not null',
      table_name
    );
    execute format(
      'create index if not exists %I on public.%I(owner_user_id)',
      table_name || '_owner_user_id_idx',
      table_name
    );
  end loop;
end;
$$;

alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings
  add constraint app_settings_pkey primary key (owner_user_id, key);

drop index if exists public.one_open_cash_session_idx;
create unique index one_open_cash_session_idx
  on public.cash_sessions(owner_user_id)
  where status = 'abierta';

alter table public.pos_sales drop constraint if exists pos_sales_folio_key;
create unique index if not exists pos_sales_owner_folio_key
  on public.pos_sales(owner_user_id, folio);

alter table public.customer_service_history
  drop constraint if exists customer_service_history_import_key_key;
drop index if exists public.customer_service_history_import_key_key;
create unique index if not exists customer_service_history_owner_import_key_key
  on public.customer_service_history(owner_user_id, import_key)
  where import_key is not null;

create or replace function public.provision_crm_account_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_settings (owner_user_id, key, value)
  values
    (new.id, 'admin_access_pin_hash', '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'),
    (new.id, 'admin_pin_requires_change', 'true'),
    (new.id, 'app_theme', 'makeup'),
    (new.id, 'company_name', ''),
    (new.id, 'module_admin_locks', '{}'),
    (new.id, 'pos_pin_hash', '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'),
    (new.id, 'profile_change_history', '[]')
  on conflict (owner_user_id, key) do nothing;
  return new;
end;
$$;

drop trigger if exists provision_crm_account_settings_on_signup on auth.users;
create trigger provision_crm_account_settings_on_signup
  after insert on auth.users
  for each row execute function public.provision_crm_account_settings();

insert into public.app_settings (owner_user_id, key, value)
select
  auth_user.id,
  defaults.key,
  defaults.value
from auth.users auth_user
cross join (
  values
    ('admin_access_pin_hash', '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'),
    ('admin_pin_requires_change', 'true'),
    ('app_theme', 'makeup'),
    ('company_name', ''),
    ('module_admin_locks', '{}'),
    ('pos_pin_hash', '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'),
    ('profile_change_history', '[]')
) as defaults(key, value)
on conflict (owner_user_id, key) do nothing;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'customers',
        'appointments',
        'notifications',
        'appointment_move_audit',
        'cash_sessions',
        'pos_sales',
        'pos_sale_items',
        'customer_service_history',
        'appointment_email_logs',
        'treatments',
        'app_settings',
        'app_users'
      ])
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end;
$$;

create policy customers_owner_all
  on public.customers for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy appointments_owner_all
  on public.appointments for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy notifications_owner_all
  on public.notifications for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy appointment_move_audit_owner_all
  on public.appointment_move_audit for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy cash_sessions_owner_all
  on public.cash_sessions for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy pos_sales_owner_all
  on public.pos_sales for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy pos_sale_items_owner_all
  on public.pos_sale_items for all to authenticated
  using (
    exists (
      select 1
      from public.pos_sales sale
      where sale.id = pos_sale_items.sale_id
        and sale.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.pos_sales sale
      where sale.id = pos_sale_items.sale_id
        and sale.owner_user_id = (select auth.uid())
    )
  );

create policy customer_service_history_owner_all
  on public.customer_service_history for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy appointment_email_logs_owner_all
  on public.appointment_email_logs for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy treatments_owner_all
  on public.treatments for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy app_settings_owner_all
  on public.app_settings for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy app_users_self_only
  on public.app_users for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.next_pos_folio()
returns text
language plpgsql
set search_path = public
as $$
declare
  next_number integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(max(regexp_replace(folio, '\D', '', 'g')::integer), 0) + 1
    into next_number
  from public.pos_sales
  where owner_user_id = auth.uid()
    and folio ~ '^POS-[0-9]+$';

  return 'POS-' || lpad(next_number::text, 5, '0');
end;
$$;

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
      owner_user_id, appointment_id, title, message, kind, target_date,
      sent_email, read, seen_at, dedupe_key
    )
    values (
      new.owner_user_id,
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
      owner_user_id = excluded.owner_user_id,
      title = excluded.title,
      message = excluded.message,
      target_date = excluded.target_date,
      dedupe_key = excluded.dedupe_key,
      sent_email = false,
      created_at = now();
    return new;
  end if;

  if (new.appointment_date is distinct from old.appointment_date)
    or (new.start_time is distinct from old.start_time)
    or (new.end_time is distinct from old.end_time) then
    insert into public.notifications (
      owner_user_id, appointment_id, title, message, kind, target_date,
      sent_email, read, seen_at, dedupe_key
    )
    values (
      new.owner_user_id,
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
      owner_user_id = excluded.owner_user_id,
      title = excluded.title,
      message = excluded.message,
      target_date = excluded.target_date,
      dedupe_key = excluded.dedupe_key,
      sent_email = false,
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
      owner_user_id, appointment_id, title, message, kind, target_date,
      sent_email, read, seen_at, dedupe_key
    )
    values (
      new.owner_user_id,
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
      owner_user_id = excluded.owner_user_id,
      title = excluded.title,
      message = excluded.message,
      target_date = excluded.target_date,
      dedupe_key = excluded.dedupe_key,
      sent_email = false,
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
    owner_user_id, appointment_id, title, message, kind, target_date,
    read, seen_at, dedupe_key
  )
  select
    appointment.owner_user_id,
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
  on conflict (appointment_id, kind) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.provision_crm_account_settings() from public, anon, authenticated;
revoke all on function public.notify_appointment_events() from public, anon, authenticated;
revoke all on function public.enqueue_tomorrow_appointment_notifications() from public, anon, authenticated;
revoke all on function public.next_pos_folio() from public, anon;
grant execute on function public.enqueue_tomorrow_appointment_notifications() to service_role;
grant execute on function public.next_pos_folio() to authenticated, service_role;

do $$
declare
  primary_user_id uuid;
  legacy_avatar_path text;
begin
  select id
    into primary_user_id
  from auth.users
  where lower(email) = 'info@danielarodriguez.com.mx'
  limit 1;

  select raw_user_meta_data ->> 'avatar_path'
    into legacy_avatar_path
  from auth.users
  where raw_user_meta_data ? 'avatar_path'
    and id <> primary_user_id
  order by updated_at desc
  limit 1;

  if legacy_avatar_path is not null then
    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('avatar_path', legacy_avatar_path)
    where id = primary_user_id;

    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'avatar_path' - 'avatar_url'
    where id <> primary_user_id
      and raw_user_meta_data ->> 'avatar_path' = legacy_avatar_path;
  end if;

  update storage.objects
  set owner_id = primary_user_id::text
  where bucket_id in ('admin-avatars', 'customer-avatars');
end;
$$;

drop policy if exists "Admin avatar read" on storage.objects;
drop policy if exists "Admin avatar insert" on storage.objects;
drop policy if exists "Admin avatar update" on storage.objects;
drop policy if exists "Admin avatar delete" on storage.objects;
drop policy if exists "customer avatars readable" on storage.objects;
drop policy if exists "customer avatars insertable" on storage.objects;
drop policy if exists "customer avatars updatable" on storage.objects;
drop policy if exists "customer avatars deletable" on storage.objects;

create policy "Admin avatar read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'admin-avatars'
    and (
      owner_id = (select auth.uid())::text
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy "Admin avatar insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'admin-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Admin avatar update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'admin-avatars'
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'admin-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Admin avatar delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'admin-avatars'
    and owner_id = (select auth.uid())::text
  );

create policy "Customer avatars readable"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'customer-avatars'
    and owner_id = (select auth.uid())::text
  );

create policy "Customer avatars insertable"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Customer avatars updatable"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'customer-avatars'
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Customer avatars deletable"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'customer-avatars'
    and owner_id = (select auth.uid())::text
  );
