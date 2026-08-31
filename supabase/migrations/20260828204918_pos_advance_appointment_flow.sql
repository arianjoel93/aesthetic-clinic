alter table public.pos_sales
  add column if not exists payment_status text not null default 'pagado'
    check (payment_status in ('anticipo', 'anticipo_pagado', 'pagado')),
  add column if not exists advance_amount numeric not null default 500
    check (advance_amount >= 0),
  add column if not exists paid_amount numeric not null default 0
    check (paid_amount >= 0),
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null;

alter table public.pos_sales
  drop constraint if exists pos_sales_payment_status_check;

alter table public.pos_sales
  add constraint pos_sales_payment_status_check
  check (payment_status in ('anticipo', 'anticipo_pagado', 'pagado'));

update public.pos_sales
set payment_status = 'anticipo_pagado'
where payment_status = 'anticipo';

update public.pos_sales
set
  payment_status = 'pagado',
  advance_amount = case when coalesce(advance_amount, 0) <= 0 then least(total, 500) else advance_amount end,
  paid_amount = case when coalesce(paid_amount, 0) <= 0 then total else paid_amount end
where paid_amount = 0;

create index if not exists pos_sales_payment_status_idx
  on public.pos_sales(payment_status);

create index if not exists pos_sales_appointment_id_idx
  on public.pos_sales(appointment_id);

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
    when coalesce(sale.payment_status, 'pagado') in ('anticipo', 'anticipo_pagado') then 'pendiente'
    when item.total > 0 then 'pagado'
    else 'sin_registro'
  end as payment_status,
  sale.payment_method,
  sale.folio as receipt_folio,
  'pos'::text as source_type,
  case
    when coalesce(sale.payment_status, 'pagado') in ('anticipo', 'anticipo_pagado') then 'Punto de Venta - anticipo pagado'
    else 'Punto de Venta'
  end as source_reference,
  sale.created_at
from public.pos_sale_items item
join public.pos_sales sale on sale.id = item.sale_id
left join public.customers customer on customer.id = sale.customer_id;

revoke all on public.sales_history from public, anon;
grant select on public.sales_history to authenticated, service_role;
