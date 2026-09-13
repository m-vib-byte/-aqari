-- Additive guard after operations-register.sql; no contract, cheque or audit backfill.
-- renewal_frozen is authoritative: redeposit/cancellation do not implicitly clear it.
begin;
create or replace function private.aqari_lock_cheque_renewal_scope() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare previous_workspace uuid; next_workspace uuid; locked integer; required_count integer;
begin
 if tg_op<>'INSERT' and old.renewal_frozen then previous_workspace:=old.workspace_id;end if;
 if tg_op<>'DELETE' and new.renewal_frozen then next_workspace:=new.workspace_id;end if;
 if previous_workspace is null and next_workspace is null then
  if tg_op='DELETE' then return old;else return new;end if;
 end if;
 -- Plain MVCC reads in the lease guard do not wait for cheque row locks. Taking
 -- only the common workspace lock avoids a lease-row/cheque-row lock inversion.
 perform 1 from public.aqari_app_state
 where workspace_id in(previous_workspace,next_workspace) order by workspace_id for update;
 get diagnostics locked=row_count;
 select count(distinct w) into required_count from unnest(array[previous_workspace,next_workspace]) w where w is not null;
 if locked<>required_count then raise exception 'مساحة عمل تجميد التجديد غير متاحة.';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function private.aqari_lock_cheque_renewal_scope() from public,anon,authenticated;
drop trigger if exists aqari_cheque_renewal_scope_lock on private.aqari_cheques;
create trigger aqari_cheque_renewal_scope_lock before insert or update or delete on private.aqari_cheques
 for each row execute function private.aqari_lock_cheque_renewal_scope();

create or replace function private.aqari_guard_frozen_lease_extension() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare extends_term boolean; activates_successor boolean;
begin
 -- Historical/no-op saves, shortened terms and status-only cancellation remain
 -- governed by the existing controls. A cancelled status cannot hide an extension.
 extends_term:=old.end_date is not null and new.end_date>old.end_date;
 activates_successor:=new.status is distinct from old.status and new.status in('ready','approved','signing','signed')
  and (old.status in('draft','ready','cancelled','expired') or new.status in('approved','signing','signed'));
 if not coalesce(extends_term,false) and not activates_successor then return new;end if;
 perform 1 from public.aqari_app_state where workspace_id=old.workspace_id for update;
 if not found then raise exception 'مساحة عمل العقد غير متاحة للتحقق من التمديد.';end if;
 -- This statement obtains a fresh snapshot after the shared lock is acquired.
 -- Use the old immutable identity, not proposed fields supplied by the caller.
 if exists(select 1 from private.aqari_cheques c join public.aqari_leases prior
  on prior.workspace_id=c.workspace_id and prior.id=c.lease_id
  where c.workspace_id=old.workspace_id and c.renewal_frozen
   and ((extends_term and prior.id=old.id) or
    (prior.tenant_id=old.tenant_id and prior.unit_id=old.unit_id and (extends_term or prior.id<>old.id)))) then
  raise exception 'لا يمكن تمديد العقد أو تفعيل عقد لاحق؛ تجميد التجديد ما زال قائمًا في سجل الشيكات.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.aqari_guard_frozen_lease_extension() from public,anon,authenticated;
drop trigger if exists aqari_frozen_lease_extension on public.aqari_leases;
create trigger aqari_frozen_lease_extension before update of end_date,status on public.aqari_leases
 for each row execute function private.aqari_guard_frozen_lease_extension();

create or replace function private.aqari_guard_frozen_lease_creation() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if not found then raise exception 'مساحة عمل العقد غير متاحة للتحقق من التجديد.';end if;
 if exists(select 1 from private.aqari_cheques c join public.aqari_leases prior
  on prior.workspace_id=c.workspace_id and prior.id=c.lease_id
  where c.workspace_id=new.workspace_id and prior.id<>new.id
   and prior.tenant_id=new.tenant_id and prior.unit_id=new.unit_id and c.renewal_frozen) then
  raise exception 'لا يمكن إنشاء عقد جديد لنفس المستأجر والوحدة قبل معالجة تجميد التجديد القائم في سجل الشيكات.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.aqari_guard_frozen_lease_creation() from public,anon,authenticated;
drop trigger if exists aqari_frozen_lease_creation on public.aqari_leases;
-- AFTER INSERT fires only for a genuinely new row, never the INSERT arm of a
-- successful ON CONFLICT UPDATE that reprojects an unchanged historical lease.
create trigger aqari_frozen_lease_creation after insert on public.aqari_leases
 for each row execute function private.aqari_guard_frozen_lease_creation();
commit;
