-- AQARI V267 Staging prerequisite for financial read models and bank reconciliation.
-- Additive only: cancelled receipts are retained as immutable audit records.
begin;

create table if not exists private.aqari_receipt_cancellations(
 id uuid primary key,
 workspace_id uuid not null,
 payment_id uuid not null references public.aqari_rent_payments(id),
 reason text not null check(length(btrim(reason))>=3),
 approved_by uuid not null,
 approved_by_name text not null,
 cancelled_at timestamptz not null default now(),
 snapshot jsonb not null,
 unique(workspace_id,id),
 unique(workspace_id,payment_id)
);
alter table private.aqari_receipt_cancellations enable row level security;
revoke all on private.aqari_receipt_cancellations from public,anon,authenticated,service_role;

drop trigger if exists aqari_receipt_cancellations_immutable on private.aqari_receipt_cancellations;
create trigger aqari_receipt_cancellations_immutable
 before update or delete on private.aqari_receipt_cancellations
 for each row execute function private.aqari_reject_immutable_change();

commit;
