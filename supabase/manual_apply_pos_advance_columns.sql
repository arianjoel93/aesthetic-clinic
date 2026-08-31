alter table public.pos_sales
  add column if not exists payment_status text not null default 'pagado',
  add column if not exists advance_amount numeric not null default 500,
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null;

alter table public.pos_sales
  drop constraint if exists pos_sales_payment_status_check;

alter table public.pos_sales
  add constraint pos_sales_payment_status_check
  check (payment_status in ('anticipo', 'anticipo_pagado', 'pagado'));

alter table public.pos_sales
  drop constraint if exists pos_sales_advance_amount_check;

alter table public.pos_sales
  add constraint pos_sales_advance_amount_check
  check (advance_amount >= 0);

alter table public.pos_sales
  drop constraint if exists pos_sales_paid_amount_check;

alter table public.pos_sales
  add constraint pos_sales_paid_amount_check
  check (paid_amount >= 0);

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
