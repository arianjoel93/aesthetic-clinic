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
