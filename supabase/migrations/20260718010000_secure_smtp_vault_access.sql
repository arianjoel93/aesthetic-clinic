create or replace function public.get_smtp_config()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select decrypted_secret::jsonb
  from vault.decrypted_secrets
  where name = 'crm_smtp_config'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_smtp_config() from public, anon, authenticated;
grant execute on function public.get_smtp_config() to service_role;

comment on function public.get_smtp_config() is
  'Returns the encrypted SMTP configuration only to server-side service-role callers.';
