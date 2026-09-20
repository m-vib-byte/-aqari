-- Historical source-statement drafts are review records, not operational occupancy.
-- They must not reserve a unit against a later real contract.
-- Ordinary drafts and all non-cancelled operational leases remain overlap-protected.
alter table public.aqari_leases
 drop constraint if exists aqari_leases_workspace_id_unit_id_daterange_excl;

alter table public.aqari_leases
 add constraint aqari_leases_workspace_id_unit_id_daterange_excl
 exclude using gist(
   workspace_id with =,
   unit_id with =,
   daterange(start_date,coalesce(vacated_on,end_date),'[]') with &&
 )
 where(
   status<>'cancelled'
   and not (
     status='draft'
     and coalesce(snapshot->>'source','')='statement-import'
   )
 );
