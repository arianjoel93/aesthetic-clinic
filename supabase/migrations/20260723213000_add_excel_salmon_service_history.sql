do $$
declare
  primary_user_id uuid;
  salmon_service_id uuid;
  salmon_service_name text;
  matched_customers integer;
begin
  select id
    into primary_user_id
  from auth.users
  where lower(email) = 'info@danielarodriguez.com.mx'
  limit 1;

  select id, name
    into salmon_service_id, salmon_service_name
  from public.services
  where name ilike 'ADN salm%'
  limit 1;

  if primary_user_id is null then
    raise exception 'Primary CRM account was not found';
  end if;

  if salmon_service_id is null then
    raise exception 'Service ADN salmon was not found';
  end if;

  with source_rows(full_name, phone, excel_row) as (
    values
      ('Alcaraz Ortiz Gabriela', '3313218383', 9),
      ('Castillo Romero Esmeralda', '3329511523', 64),
      ('Maria Diaz Dalia Soraya', '3316944884', 205),
      ('Sarabia Rodriguez Angelica Patricia', '3315997673', 306)
  ),
  customer_matches as (
    select source.excel_row, customer.id
    from source_rows source
    cross join lateral (
      select candidate.id
      from public.customers candidate
      where candidate.owner_user_id = primary_user_id
        and (
          lower(trim(candidate.full_name)) = lower(trim(source.full_name))
          or regexp_replace(
            coalesce(candidate.whatsapp, candidate.phone, ''),
            '\D',
            '',
            'g'
          ) = source.phone
        )
      order by
        (lower(trim(candidate.full_name)) = lower(trim(source.full_name))) desc,
        candidate.created_at
      limit 1
    ) customer
  )
  select count(*)
    into matched_customers
  from customer_matches;

  if matched_customers <> 4 then
    raise exception 'Expected 4 ADN salmón customers, matched %', matched_customers;
  end if;

  with source_rows(full_name, phone, excel_row) as (
    values
      ('Alcaraz Ortiz Gabriela', '3313218383', 9),
      ('Castillo Romero Esmeralda', '3329511523', 64),
      ('Maria Diaz Dalia Soraya', '3316944884', 205),
      ('Sarabia Rodriguez Angelica Patricia', '3315997673', 306)
  ),
  customer_matches as (
    select source.excel_row, customer.id
    from source_rows source
    cross join lateral (
      select candidate.id
      from public.customers candidate
      where candidate.owner_user_id = primary_user_id
        and (
          lower(trim(candidate.full_name)) = lower(trim(source.full_name))
          or regexp_replace(
            coalesce(candidate.whatsapp, candidate.phone, ''),
            '\D',
            '',
            'g'
          ) = source.phone
        )
      order by
        (lower(trim(candidate.full_name)) = lower(trim(source.full_name))) desc,
        candidate.created_at
      limit 1
    ) customer
  )
  insert into public.customer_service_history (
    owner_user_id,
    customer_id,
    service_id,
    service_name,
    service_date,
    payment_status,
    source_type,
    source_reference,
    import_key
  )
  select
    primary_user_id,
    customer.id,
    salmon_service_id,
    salmon_service_name,
    current_date,
    'sin_registro',
    'importacion',
    'BOTOX - ACIDO I. - fila ' || customer.excel_row || ' (ADN DE SALMON)',
    'expedientes-20260723:adn-salmon:fila-' || customer.excel_row
  from customer_matches customer
  on conflict do nothing;
end;
$$;
