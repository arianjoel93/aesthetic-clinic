do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'customers', 'services', 'app_settings', 'cash_sessions', 'pos_sales', 'pos_sale_items'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    exception when duplicate_object then
      null;
    end;
  end loop;
end;
$$;
