-- AQARI V267 Preview/Staging: append-only handover ledger for generated official PDF versions.
create table if not exists private.aqari_official_document_handovers(
 id uuid primary key,workspace_id uuid not null references public.aqari_workspaces(id),series_id uuid not null,version integer not null check(version>0),
 actor_id uuid not null,actor_name text not null,recorded_at timestamptz not null default now(),details jsonb not null check(jsonb_typeof(details)='object'),source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
 foreign key(workspace_id,series_id,version) references private.aqari_official_document_versions(workspace_id,series_id,version),unique(workspace_id,id)
);
create table if not exists private.aqari_official_document_handover_voids(
 id uuid primary key,handover_id uuid not null unique references private.aqari_official_document_handovers(id),actor_id uuid not null,actor_name text not null,recorded_at timestamptz not null default now(),reason text not null check(length(btrim(reason)) between 5 and 500)
);
create index if not exists aqari_official_document_handovers_series on private.aqari_official_document_handovers(workspace_id,series_id,recorded_at desc,id desc);
alter table private.aqari_official_document_handovers enable row level security;alter table private.aqari_official_document_handover_voids enable row level security;
revoke all on private.aqari_official_document_handovers,private.aqari_official_document_handover_voids from public,anon,authenticated,service_role;
drop trigger if exists aqari_official_document_handovers_immutable on private.aqari_official_document_handovers;create trigger aqari_official_document_handovers_immutable before update or delete on private.aqari_official_document_handovers for each row execute function private.aqari_reject_immutable_change();
drop trigger if exists aqari_official_document_handover_voids_immutable on private.aqari_official_document_handover_voids;create trigger aqari_official_document_handover_voids_immutable before update or delete on private.aqari_official_document_handover_voids for each row execute function private.aqari_reject_immutable_change();
