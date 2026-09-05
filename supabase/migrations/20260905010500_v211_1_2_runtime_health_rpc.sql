create or replace function public.aqari_runtime_health()
returns boolean
language sql
stable
parallel safe
security invoker
set search_path = ''
as $function$
  select true
$function$;

revoke all on function public.aqari_runtime_health() from public;
grant execute on function public.aqari_runtime_health() to anon, authenticated;

comment on function public.aqari_runtime_health()
  is 'V211.1.2 anonymous readiness probe; returns a constant and reads no application data.';
