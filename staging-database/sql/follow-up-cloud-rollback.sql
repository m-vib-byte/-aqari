-- Roll back only this additive staging repair while its new journal is empty.
-- Refuse to remove any saved follow-up history.
begin;
lock table private.aqari_follow_up_events in access exclusive mode;
do $$begin
 if exists(select 1 from private.aqari_follow_up_events) then
  raise exception 'FOLLOW_UP_HISTORY_EXISTS: export and review before rollback';
 end if;
end $$;
drop function public.aqari_record_follow_up_event(uuid,text,text,text,text,bigint);
drop function public.aqari_list_follow_up_events(uuid,text,text,integer);
drop function private.aqari_record_follow_up_event(uuid,text,text,text,text,bigint);
drop function private.aqari_list_follow_up_events(uuid,text,text,integer);
drop table private.aqari_follow_up_events;
commit;
