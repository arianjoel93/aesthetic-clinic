-- Keep all application records behind an authenticated Supabase session.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'app_settings',
        'services',
        'cash_sessions',
        'pos_sales',
        'pos_sale_items'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

create policy "Authenticated settings read"
on public.app_settings for select
to authenticated
using (auth.uid() is not null);

create policy "Authenticated settings insert"
on public.app_settings for insert
to authenticated
with check (auth.uid() is not null);

create policy "Authenticated settings update"
on public.app_settings for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "Authenticated services read"
on public.services for select
to authenticated
using (auth.uid() is not null);

create policy "Authenticated services insert"
on public.services for insert
to authenticated
with check (auth.uid() is not null);

create policy "Authenticated services update"
on public.services for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "Authenticated services delete"
on public.services for delete
to authenticated
using (auth.uid() is not null);

create policy "Authenticated cash read"
on public.cash_sessions for select
to authenticated
using (auth.uid() is not null);

create policy "Authenticated cash insert"
on public.cash_sessions for insert
to authenticated
with check (auth.uid() is not null);

create policy "Authenticated cash update"
on public.cash_sessions for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "Authenticated sales read"
on public.pos_sales for select
to authenticated
using (auth.uid() is not null);

create policy "Authenticated sales insert"
on public.pos_sales for insert
to authenticated
with check (auth.uid() is not null);

create policy "Authenticated sales delete"
on public.pos_sales for delete
to authenticated
using (auth.uid() is not null);

create policy "Authenticated sale items read"
on public.pos_sale_items for select
to authenticated
using (auth.uid() is not null);

create policy "Authenticated sale items insert"
on public.pos_sale_items for insert
to authenticated
with check (auth.uid() is not null);

create policy "Authenticated sale items delete"
on public.pos_sale_items for delete
to authenticated
using (auth.uid() is not null);

alter function public.get_admin_profile(text) set search_path = public, auth;
alter function public.update_admin_profile(text, text, text, text, text, text) set search_path = public, auth;
alter function public.update_admin_password(text, text) set search_path = public, auth;
alter function public.notify_appointment_events() set search_path = public;
alter function public.next_pos_folio() set search_path = public;
alter function public.set_updated_at() set search_path = public;

revoke all on function public.get_admin_profile(text) from public, anon, authenticated;
revoke all on function public.update_admin_profile(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_admin_password(text, text) from public, anon, authenticated;
revoke all on function public.notify_appointment_events() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.next_pos_folio() from public, anon;

grant execute on function public.get_admin_profile(text) to service_role;
grant execute on function public.update_admin_profile(text, text, text, text, text, text) to service_role;
grant execute on function public.update_admin_password(text, text) to service_role;
grant execute on function public.next_pos_folio() to authenticated, service_role;
