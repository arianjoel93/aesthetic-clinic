-- Limpia usuarios internos de la app para que el acceso se cree manualmente desde Supabase Auth.
delete from public.app_users;
