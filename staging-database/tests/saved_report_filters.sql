begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('filters-a@example.invalid','Synthetic filters A','general_manager','aqari-v267-staging'),
 ('filters-b@example.invalid','Synthetic filters B','viewer','aqari-v267-staging');
insert into auth.users(id,email) values
 ('f2670000-0000-4000-8000-000000000001','filters-a@example.invalid'),
 ('f2670000-0000-4000-8000-000000000002','filters-b@example.invalid');
select set_config('aqari.test.filters.workspace',(select workspace_id::text from public.aqari_memberships where user_id='f2670000-0000-4000-8000-000000000001' and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values('f2670000-0000-4000-8000-000000000011',current_setting('aqari.test.filters.workspace')::uuid,'filters-a','Synthetic filters','{}');
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare w uuid:=current_setting('aqari.test.filters.workspace')::uuid;v jsonb;bad jsonb;
begin
 v:=public.aqari_report_filters(w,'owner_report','get');if v<>'{}'::jsonb then raise exception 'DEFAULT_NOT_EMPTY';end if;
 perform public.aqari_report_filters(w,'owner_report','save','{"from":"2026-09-01","to":"2026-09-30"}');
 v:=public.aqari_report_filters(w,'owner_report','get');if v<>'{"from":"2026-09-01","to":"2026-09-30"}'::jsonb then raise exception 'FILTER_READBACK_FAILED';end if;
 perform public.aqari_report_filters(w,'hr_monthly','save','{"property_id":"f2670000-0000-4000-8000-000000000011","month":"2026-09"}');
 perform public.aqari_report_filters(w,'hr_annual','save','{"property_id":"","year":"2026"}');
 perform public.aqari_report_filters(w,'property_statements','save','{"property_id":"f2670000-0000-4000-8000-000000000011","month":"2026-08"}');
 if (select count(*) from public.aqari_saved_report_filters)<>4 then raise exception 'REPORT_KEYS_NOT_SEPARATE';end if;
 perform public.aqari_report_filters(w,'owner_report','save','{"from":"2026-10-01","to":"2026-10-31"}');
 if (select count(*) from public.aqari_saved_report_filters)<>4 then raise exception 'DUPLICATED_PREFERENCE';end if;
 for bad in select value from jsonb_array_elements('[null,[],{}, {"from":"2026-02-30","to":"2026-03-01"},{"from":"2026-03-01","to":"2026-02-01"},{"from":"2026-09-01","to":"2026-09-30","extra":"x"}]') loop
  begin perform public.aqari_report_filters(w,'owner_report','save',bad);raise exception 'INVALID_FILTER_ACCEPTED';exception when raise_exception then if sqlerrm<>'INVALID_REPORT_FILTERS' then raise;end if;end;
 end loop;
 begin perform public.aqari_report_filters(w,'hr_monthly','save','{"property_id":"f2670000-0000-4000-8000-000000000011","month":"2026-13"}');raise exception 'INVALID_MONTH_ACCEPTED';exception when raise_exception then if sqlerrm<>'INVALID_REPORT_FILTERS' then raise;end if;end;
 begin perform public.aqari_report_filters(w,'hr_monthly','save','{"property_id":"f2670000-0000-4000-8000-000000000099","month":"2026-09"}');raise exception 'UNKNOWN_PROPERTY_ACCEPTED';exception when raise_exception then if sqlerrm<>'INVALID_REPORT_FILTERS' then raise;end if;end;
 begin perform public.aqari_report_filters('f2670000-0000-4000-8000-000000000099','owner_report','get');raise exception 'OTHER_WORKSPACE_ALLOWED';exception when insufficient_privilege then null;end;
 begin update public.aqari_saved_report_filters set user_id='f2670000-0000-4000-8000-000000000002';raise exception 'OWNER_TRANSFER_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000002',true);
do $$ declare w uuid:=current_setting('aqari.test.filters.workspace')::uuid;n integer;
begin
 if public.aqari_report_filters(w,'owner_report','get')<>'{}'::jsonb or exists(select 1 from public.aqari_saved_report_filters) then raise exception 'OTHER_USER_VISIBLE';end if;
 update public.aqari_saved_report_filters set filters='{}';get diagnostics n=row_count;if n<>0 then raise exception 'OTHER_USER_UPDATE_ALLOWED';end if;
 delete from public.aqari_saved_report_filters;get diagnostics n=row_count;if n<>0 then raise exception 'OTHER_USER_DELETE_ALLOWED';end if;
 begin insert into public.aqari_saved_report_filters(workspace_id,user_id,report_key,filters) values(w,'f2670000-0000-4000-8000-000000000001','owner_report','{}');raise exception 'OTHER_USER_INSERT_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000001',true);
do $$ declare w uuid:=current_setting('aqari.test.filters.workspace')::uuid;
begin
 if public.aqari_report_filters(w,'owner_report','get')->>'from'<>'2026-10-01' then raise exception 'SAVED_FILTER_CHANGED_BY_OTHER_USER';end if;
 perform public.aqari_report_filters(w,'owner_report','clear');if public.aqari_report_filters(w,'owner_report','get')<>'{}'::jsonb then raise exception 'CLEAR_FAILED';end if;
 if public.aqari_report_filters(w,'hr_annual','get')->>'year'<>'2026' then raise exception 'CLEAR_DELETED_OTHER_REPORT';end if;
end $$;
reset role;
update public.aqari_memberships set is_active=false where user_id='f2670000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.aqari_saved_report_filters) then raise exception 'REVOKED_USER_VISIBLE';end if;
 begin perform public.aqari_report_filters(current_setting('aqari.test.filters.workspace')::uuid,'hr_annual','get');raise exception 'REVOKED_USER_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;set local role anon;
do $$ begin
 begin select count(*) from public.aqari_saved_report_filters;raise exception 'ANON_TABLE_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_report_filters(current_setting('aqari.test.filters.workspace')::uuid,'hr_annual','get');raise exception 'ANON_RPC_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: filters persistence, update/clear, report/user/workspace isolation, validation, RLS ownership and revoked/anonymous denial' as result;
rollback;
