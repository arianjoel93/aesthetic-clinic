create extension if not exists pg_trgm;

create index if not exists customers_created_at_id_desc_idx
  on public.customers (created_at desc, id desc);

create index if not exists customers_full_name_lower_idx
  on public.customers (lower(full_name));

create index if not exists customers_full_name_trgm_idx
  on public.customers using gin (full_name gin_trgm_ops);

create index if not exists customers_email_trgm_idx
  on public.customers using gin (email gin_trgm_ops);

create index if not exists customers_phone_trgm_idx
  on public.customers using gin (phone gin_trgm_ops);

create index if not exists customers_whatsapp_trgm_idx
  on public.customers using gin (whatsapp gin_trgm_ops);

create index if not exists customers_rfc_trgm_idx
  on public.customers using gin (rfc gin_trgm_ops);
