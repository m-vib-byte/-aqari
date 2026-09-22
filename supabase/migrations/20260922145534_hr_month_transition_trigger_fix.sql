begin;

drop trigger if exists aqari_hr_month_transition_guard on private.aqari_hr_months;
drop trigger if exists aqari_hr_month_insert_guard on private.aqari_hr_months;
drop trigger if exists aqari_hr_month_update_guard on private.aqari_hr_months;

create trigger aqari_hr_month_insert_guard
after insert on private.aqari_hr_months
for each row execute function private.aqari_hr_month_transition_guard();

create trigger aqari_hr_month_update_guard
before update on private.aqari_hr_months
for each row execute function private.aqari_hr_month_transition_guard();

commit;
