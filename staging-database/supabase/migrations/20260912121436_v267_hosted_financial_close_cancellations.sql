-- Apply after final-gap-register.sql and the KPI function. No financial records or saved snapshots change.
-- Future closes and KPIs exclude both native cancelled status and cancellation evidence.
-- Supports the original function, the prior register-only repair, and safe retries.
begin;
do $patch$
declare
 source text;
 anchor text := 'p.workspace_id=w and p.paid_at>=v_month and p.paid_at<(v_month+interval ''1 month'')::date)';
 previous_replacement text := 'p.workspace_id=w and p.paid_at>=v_month and p.paid_at<(v_month+interval ''1 month'')::date and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id))';
 replacement text := 'p.workspace_id=w and p.paid_at>=v_month and p.paid_at<(v_month+interval ''1 month'')::date and p.status<>''cancelled'' and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id))';
 old_count integer;
 previous_count integer;
 new_count integer;
begin
 if to_regclass('private.aqari_receipt_cancellations') is null then
  raise exception 'FINANCIAL_CANCELLATION_REGISTER_REQUIRED';
 end if;
 source := pg_get_functiondef('public.aqari_financial_register(uuid,text,jsonb)'::regprocedure);
 old_count := (length(source)-length(replace(source,anchor,'')))/length(anchor);
 previous_count := (length(source)-length(replace(source,previous_replacement,'')))/length(previous_replacement);
 new_count := (length(source)-length(replace(source,replacement,'')))/length(replacement);
 if old_count=0 and previous_count=0 and new_count=2 then return; end if;
 if old_count=2 and previous_count=0 and new_count=0 then
  source:=replace(source,anchor,replacement);
 elsif old_count=0 and previous_count=2 and new_count=0 then
  -- Upgrade the previous register-only repair without dropping the function.
  source:=replace(source,previous_replacement,replacement);
 else
  raise exception 'FINANCIAL_CLOSE_SOURCE_CHANGED';
 end if;
 -- CREATE OR REPLACE keeps ownership and grants; existing authorization, AAL2,
 -- serialization lock, immutable periods and audit logic remain unmodified.
 execute source;
end $patch$;

-- The dashboard must use the same cancellation evidence as future period closes.
do $kpi_patch$
declare
 source text;
 anchor text := 'where p.workspace_id=w and p.status<>''cancelled'' and p.paid_at::date between from_date and to_date;';
 replacement text := 'where p.workspace_id=w and p.status<>''cancelled'' and p.paid_at::date between from_date and to_date and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id);';
 old_count integer;
 new_count integer;
begin
 source := pg_get_functiondef('public.aqari_kpi_dashboard(uuid,date,date)'::regprocedure);
 old_count := (length(source)-length(replace(source,anchor,'')))/length(anchor);
 new_count := (length(source)-length(replace(source,replacement,'')))/length(replacement);
 if old_count=0 and new_count=1 then return;end if;
 if old_count<>1 or new_count<>0 then raise exception 'FINANCIAL_KPI_SOURCE_CHANGED';end if;
 execute replace(source,anchor,replacement);
end $kpi_patch$;
commit;
