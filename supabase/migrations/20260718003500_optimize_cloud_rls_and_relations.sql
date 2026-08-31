do $$
declare
  policy_record record;
  statement text;
begin
  for policy_record in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        qual = '(auth.uid() IS NOT NULL)'
        or with_check = '(auth.uid() IS NOT NULL)'
      )
  loop
    statement := format(
      'alter policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );

    if policy_record.qual = '(auth.uid() IS NOT NULL)' then
      statement := statement || ' using ((select auth.uid()) is not null)';
    end if;

    if policy_record.with_check = '(auth.uid() IS NOT NULL)' then
      statement := statement || ' with check ((select auth.uid()) is not null)';
    end if;

    execute statement;
  end loop;
end
$$;

create index if not exists appointment_move_audit_appointment_id_idx
  on public.appointment_move_audit(appointment_id);

create index if not exists appointments_customer_id_idx
  on public.appointments(customer_id);

create index if not exists appointments_treatment_id_idx
  on public.appointments(treatment_id);

create index if not exists pos_sale_items_sale_id_idx
  on public.pos_sale_items(sale_id);

create index if not exists pos_sales_cash_session_id_idx
  on public.pos_sales(cash_session_id);
