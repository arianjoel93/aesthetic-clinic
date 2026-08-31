update public.customer_service_history
set service_date = current_date
where service_date is null;

create index if not exists customer_service_history_sales_order_idx
  on public.customer_service_history(service_date desc, created_at desc);

create index if not exists appointments_completed_sales_idx
  on public.appointments(appointment_date desc, created_at desc)
  where status = 'completada';

create index if not exists pos_sales_created_at_idx
  on public.pos_sales(created_at desc);

create or replace view public.sales_history
with (security_invoker = true)
as
select
  'historial:' || history.id::text as id,
  history.customer_id,
  customer.full_name as customer_name,
  customer.email as customer_email,
  coalesce(nullif(customer.whatsapp, ''), customer.phone) as customer_phone,
  history.service_id,
  history.service_name,
  history.service_date as sale_date,
  history.amount,
  history.payment_status,
  history.payment_method,
  history.receipt_folio,
  history.source_type,
  history.source_reference,
  history.created_at
from public.customer_service_history history
join public.customers customer on customer.id = history.customer_id

union all

select
  'cita:' || appointment.id::text as id,
  appointment.customer_id,
  coalesce(customer.full_name, appointment.customer_name, 'Cliente') as customer_name,
  coalesce(customer.email, appointment.customer_email) as customer_email,
  coalesce(
    nullif(customer.whatsapp, ''),
    customer.phone,
    appointment.customer_whatsapp
  ) as customer_phone,
  appointment.service_id,
  concat_ws(
    ' - ',
    nullif(appointment.service, ''),
    nullif(appointment.service_subtype, '')
  ) as service_name,
  appointment.appointment_date as sale_date,
  nullif(
    round(
      (
        coalesce(appointment.cost, 0)
        * (1 - coalesce(appointment.discount_percent, 0) / 100)
      )::numeric,
      2
    ),
    0
  ) as amount,
  case
    when coalesce(appointment.cost, 0) > 0 then 'pagado'
    else 'sin_registro'
  end as payment_status,
  null::text as payment_method,
  null::text as receipt_folio,
  'cita'::text as source_type,
  'Cita completada'::text as source_reference,
  appointment.created_at
from public.appointments appointment
left join public.customers customer on customer.id = appointment.customer_id
where appointment.status = 'completada'

union all

select
  'pos:' || item.id::text as id,
  sale.customer_id,
  coalesce(customer.full_name, sale.customer_name, 'Venta general') as customer_name,
  customer.email as customer_email,
  coalesce(nullif(customer.whatsapp, ''), customer.phone) as customer_phone,
  item.service_id,
  item.service_name,
  (sale.created_at at time zone 'America/Mexico_City')::date as sale_date,
  nullif(item.total, 0) as amount,
  case
    when item.total > 0 then 'pagado'
    else 'sin_registro'
  end as payment_status,
  sale.payment_method,
  sale.folio as receipt_folio,
  'pos'::text as source_type,
  'Punto de Venta'::text as source_reference,
  sale.created_at
from public.pos_sale_items item
join public.pos_sales sale on sale.id = item.sale_id
left join public.customers customer on customer.id = sale.customer_id;

revoke all on public.sales_history from public, anon;
grant select on public.sales_history to authenticated, service_role;

create or replace function public.dashboard_treatment_counts(
  p_date_from date default null,
  p_date_to date default null,
  p_service text default null
)
returns table (
  service_name text,
  service_count bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with grouped as (
    select
      sales.service_name,
      count(*)::bigint as service_count
    from public.sales_history sales
    where (p_date_from is null or sales.sale_date >= p_date_from)
      and (p_date_to is null or sales.sale_date <= p_date_to)
      and (
        p_service is null
        or lower(sales.service_name) = lower(p_service)
        or lower(sales.service_name) like lower(p_service) || ' - %'
      )
    group by sales.service_name
  ),
  totals as (
    select coalesce(sum(grouped.service_count), 0)::bigint as total_count
    from grouped
  )
  select
    grouped.service_name,
    grouped.service_count,
    totals.total_count
  from grouped
  cross join totals
  order by grouped.service_count desc, grouped.service_name;
$$;

revoke all on function public.dashboard_treatment_counts(date, date, text)
  from public, anon;
grant execute on function public.dashboard_treatment_counts(date, date, text)
  to authenticated, service_role;
