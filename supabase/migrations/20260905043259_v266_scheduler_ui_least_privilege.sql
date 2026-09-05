-- AQARI V266: expose scheduler status to the authenticated general manager only.
revoke all privileges on table public.aqari_scheduler_config from anon, authenticated;
revoke all privileges on table public.aqari_scheduler_runs from anon, authenticated;

grant select on table public.aqari_scheduler_config to authenticated;
grant update (enabled, due_day) on table public.aqari_scheduler_config to authenticated;
grant select on table public.aqari_scheduler_runs to authenticated;

drop policy if exists aqari_scheduler_config_manager_write
  on public.aqari_scheduler_config;

drop policy if exists aqari_scheduler_config_manager_update
  on public.aqari_scheduler_config;

create policy aqari_scheduler_config_manager_update
  on public.aqari_scheduler_config
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.aqari_memberships as m
      where m.workspace_id = aqari_scheduler_config.workspace_id
        and m.user_id = (select auth.uid())
        and m.is_active = true
        and m.role = 'general_manager'::public.aqari_role
    )
  )
  with check (
    exists (
      select 1
      from public.aqari_memberships as m
      where m.workspace_id = aqari_scheduler_config.workspace_id
        and m.user_id = (select auth.uid())
        and m.is_active = true
        and m.role = 'general_manager'::public.aqari_role
    )
  );

revoke execute on function public.aqari_run_daily_automation(uuid, date, text)
  from public, anon, authenticated;
