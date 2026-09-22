-- Synthetic local fixtures only. Never run against a hosted database.
begin;
create function pg_temp.staff_actor(uid uuid,seconds_old integer default 0,aal text default 'aal2') returns void language plpgsql as $$begin
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'aal',aal,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))-seconds_old)))::text,true);
end$$;
create function pg_temp.staff_expect(w uuid,action text,payload jsonb,expected text) returns void language plpgsql as $$begin
 begin
  perform public.aqari_staff_account_preparations(w,action,payload);
 exception when others then
  if sqlerrm=expected then return;end if;
  raise exception 'Expected %, received % (%)',expected,sqlerrm,sqlstate;
 end;
 raise exception 'Expected rejection %',expected;
end$$;
create function pg_temp.staff_request(email text,role text default 'viewer') returns jsonb language sql as $$select jsonb_build_object('request_id',gen_random_uuid(),'email',email,'display_name','Synthetic new staff','role',role,'reason','Synthetic preparation test')$$;

insert into public.aqari_workspaces(id,slug,name) values('74000000-0000-4000-8000-000000000002','staff-preparation-other','Other synthetic workspace');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('prep-manager@example.invalid','Synthetic Manager','general_manager','aqari-v267-staging'),
 ('prep-second-manager@example.invalid','Second Synthetic Manager','general_manager','aqari-v267-staging'),
 ('prep-accountant@example.invalid','Synthetic Accountant','accountant','aqari-v267-staging'),
 ('prep-viewer@example.invalid','Synthetic Viewer','viewer','aqari-v267-staging'),
 ('prep-existing-auth@example.invalid','Existing Auth','viewer','staff-preparation-other'),
 ('prep-existing-allow@example.invalid','Existing Allow','viewer','staff-preparation-other');
insert into auth.users(id,email) values
 ('74000000-0000-4000-8000-000000000100','prep-manager@example.invalid'),
 ('74000000-0000-4000-8000-000000000101','prep-second-manager@example.invalid'),
 ('74000000-0000-4000-8000-000000000102','prep-accountant@example.invalid'),
 ('74000000-0000-4000-8000-000000000103','prep-viewer@example.invalid'),
 ('74000000-0000-4000-8000-000000000104','prep-existing-auth@example.invalid');
delete from private.aqari_allowed_users where email='prep-existing-auth@example.invalid';
update private.aqari_allowed_users set is_active=false where email='prep-existing-allow@example.invalid';
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values('74000000-0000-4000-8000-000000000201','74000000-0000-4000-8000-000000000002','prep-property','Synthetic property','{}');
insert into private.aqari_partner_access(workspace_id,email,property_id,display_name,is_active,updated_by) values('74000000-0000-4000-8000-000000000002','prep-existing-partner@example.invalid','74000000-0000-4000-8000-000000000201','Synthetic partner',false,'74000000-0000-4000-8000-000000000100');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,is_active,profile) values('74000000-0000-4000-8000-000000000202','74000000-0000-4000-8000-000000000002','prep-tenant','Synthetic tenant','000000000000','00000000','prep-existing-tenant@example.invalid',false,'{}');

do $$declare
 w uuid:='70000000-0000-4000-8000-000000000001';other_w uuid:='74000000-0000-4000-8000-000000000002';
 manager uuid:='74000000-0000-4000-8000-000000000100';second_manager uuid:='74000000-0000-4000-8000-000000000101';
 req jsonb;cancel_req jsonb;r jsonb;again jsonb;prep_id uuid;role_name text;mail text;old_hash text;new_hash text;before_count bigint;
begin
 -- Denials, stale/future MFA, strict input and explicit membership revocation.
 perform pg_temp.staff_actor(null);
 perform pg_temp.staff_expect(w,'list','{}','ACCESS_DENIED');
 perform pg_temp.staff_actor('74000000-0000-4000-8000-000000000102');
 perform pg_temp.staff_expect(w,'list','{}','ACCESS_DENIED');
 perform pg_temp.staff_actor('74000000-0000-4000-8000-000000000103');
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('denied@example.invalid'),'ACCESS_DENIED');
 perform pg_temp.staff_actor(manager);
 perform pg_temp.staff_expect(other_w,'list','{}','ACCESS_DENIED');
 perform pg_temp.staff_actor(manager,0,'aal1');
 perform public.aqari_staff_account_preparations(w,'list','{}');
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('no-mfa@example.invalid'),'MFA_REQUIRED');
 perform pg_temp.staff_actor(manager,901);
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('stale@example.invalid'),'MFA_RECENT_REAUTH_REQUIRED');
 perform pg_temp.staff_actor(manager,-61);
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('future@example.invalid'),'MFA_RECENT_REAUTH_REQUIRED');
 perform pg_temp.staff_actor(manager);
 update public.aqari_memberships set is_active=false where workspace_id=w and user_id=manager;
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('revoked@example.invalid'),'ACCESS_DENIED');
 update public.aqari_memberships set is_active=true where workspace_id=w and user_id=manager;
 perform pg_temp.staff_expect(w,'list',null,'INVALID_STAFF_PREPARATION');
 perform pg_temp.staff_expect(w,'list','[]','INVALID_STAFF_PREPARATION');
 perform pg_temp.staff_expect(w,'list','{"extra":true}','INVALID_STAFF_PREPARATION');
 perform pg_temp.staff_expect(w,'unknown','{}','INVALID_STAFF_PREPARATION');
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('invalid@example.invalid','general_manager'),'INVALID_STAFF_PREPARATION');
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('invalid@example.invalid','owner'),'INVALID_STAFF_PREPARATION');
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('not-an-email'),'INVALID_STAFF_PREPARATION');
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('invalid@example.invalid')||'{"workspace_slug":"staff-preparation-other"}','INVALID_STAFF_PREPARATION');
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('invalid@example.invalid')||'{"request_id":"bad"}','INVALID_STAFF_PREPARATION');
 perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request('invalid@example.invalid')||'{"reason":"x"}','INVALID_STAFF_PREPARATION');

 -- Existing identities are rejected globally, including inactive rows.
 select md5(string_agg(to_jsonb(a)::text,',' order by email)) into old_hash from private.aqari_allowed_users a;
 foreach mail in array array['prep-existing-auth@example.invalid','PREP-EXISTING-ALLOW@example.invalid','prep-existing-partner@example.invalid','prep-existing-tenant@example.invalid'] loop
  perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request(mail),'STAFF_EMAIL_UNAVAILABLE');
 end loop;
 select md5(string_agg(to_jsonb(a)::text,',' order by email)) into new_hash from private.aqari_allowed_users a;
 if old_hash is distinct from new_hash or exists(select 1 from private.aqari_staff_account_preparations) then raise exception 'Rejected preparations changed existing rows';end if;

 -- All three supported base roles create only a scoped allowlist and a preparation.
 select count(*) into before_count from auth.users;
 foreach role_name in array array['viewer','accountant','property_manager'] loop
  req:=pg_temp.staff_request('new-'||role_name||'@example.invalid',role_name);
  r:=public.aqari_staff_account_preparations(w,'prepare',req);
  if r->>'workspace_id'<>w::text or r->>'user_id'<>manager::text or r#>>'{record,status}'<>'prepared' or r#>>'{record,revision}'<>'1' or r#>>'{record,role}'<>role_name or r#>>'{record,request_id}'<>req->>'request_id' or r#>>'{record,can_cancel}'<>'true' then raise exception 'Incorrect preparation response';end if;
  if not exists(select 1 from private.aqari_allowed_users a where a.email=req->>'email' and a.workspace_slug='aqari-v267-staging' and a.role::text=role_name and a.is_active) then raise exception 'Incorrect scoped allowlist';end if;
  again:=public.aqari_staff_account_preparations(w,'prepare',req);
  if again is distinct from r or (select count(*) from private.aqari_staff_preparation_audit where request_id=(req->>'request_id')::uuid)<>1 then raise exception 'Preparation retry is not idempotent';end if;
  perform pg_temp.staff_expect(w,'prepare',req||'{"display_name":"Different"}','STAFF_PREPARATION_REQUEST_CONFLICT');
  perform pg_temp.staff_expect(w,'prepare',pg_temp.staff_request(req->>'email'),'STAFF_EMAIL_UNAVAILABLE');
 end loop;
 if (select count(*) from auth.users)<>before_count or exists(select 1 from private.aqari_staff_assignments) then raise exception 'Preparation created an account or operational grant';end if;

 -- Pending email cannot race into tenant, partner or existing Auth identities.
 begin
  update public.aqari_tenants set email='new-viewer@example.invalid' where id='74000000-0000-4000-8000-000000000202';
  raise exception 'Expected tenant collision';
 exception when unique_violation then if sqlerrm<>'STAFF_EMAIL_UNAVAILABLE' then raise;end if;end;
 begin
  update private.aqari_partner_access set email='new-viewer@example.invalid' where email='prep-existing-partner@example.invalid';
  raise exception 'Expected partner collision';
 exception when unique_violation then if sqlerrm<>'STAFF_EMAIL_UNAVAILABLE' then raise;end if;end;
 begin
  update auth.users set email='new-viewer@example.invalid' where id='74000000-0000-4000-8000-000000000104';
  raise exception 'Expected existing Auth collision';
 exception when unique_violation then if sqlerrm<>'STAFF_EMAIL_UNAVAILABLE' then raise;end if;end;

 -- Only the preparing manager can cancel, with an unchanged owned allowlist row.
 req:=pg_temp.staff_request('cancel-new@example.invalid');r:=public.aqari_staff_account_preparations(w,'prepare',req);prep_id:=(r#>>'{record,id}')::uuid;
 cancel_req:=jsonb_build_object('request_id',gen_random_uuid(),'id',prep_id,'revision',1,'reason','Synthetic cancellation');
 perform pg_temp.staff_actor(second_manager);
 again:=public.aqari_staff_account_preparations(w,'list','{}');
 if exists(select 1 from jsonb_array_elements(again->'items') x where x->>'can_cancel'='true') then raise exception 'Other manager owns cancellation';end if;
 perform pg_temp.staff_expect(w,'cancel',cancel_req,'STAFF_PREPARATION_NOT_CANCELLABLE');
 perform pg_temp.staff_expect(w,'prepare',req,'STAFF_PREPARATION_REQUEST_CONFLICT');
 perform pg_temp.staff_actor(manager);
 perform pg_temp.staff_expect(w,'cancel',cancel_req||'{"revision":2}','STAFF_PREPARATION_REVISION_CONFLICT');
 update private.aqari_allowed_users set display_name='Changed externally' where email='cancel-new@example.invalid';
 perform pg_temp.staff_expect(w,'cancel',cancel_req,'STAFF_PREPARATION_ALLOWLIST_CHANGED');
 update private.aqari_allowed_users set display_name='Synthetic new staff' where email='cancel-new@example.invalid';
 r:=public.aqari_staff_account_preparations(w,'cancel',cancel_req);
 if r#>>'{record,status}'<>'cancelled' or r#>>'{record,revision}'<>'2' or r#>>'{record,request_id}'<>cancel_req->>'request_id' or r#>>'{record,can_cancel}'<>'false' then raise exception 'Invalid cancellation response';end if;
 again:=public.aqari_staff_account_preparations(w,'cancel',cancel_req);
 if again is distinct from r or (select count(*) from private.aqari_staff_preparation_audit where request_id=(cancel_req->>'request_id')::uuid)<>1 then raise exception 'Cancellation replay repeated audit';end if;
 if (select is_active from private.aqari_allowed_users where email='cancel-new@example.invalid') then raise exception 'Owned allowlist not disabled';end if;
 begin
  insert into auth.users(id,email) values('74000000-0000-4000-8000-000000000500','cancel-new@example.invalid');
  raise exception 'Cancelled preparation authorized signup';
 exception when invalid_authorization_specification then if sqlerrm<>'EMAIL_NOT_AUTHORIZED' then raise;end if;end;

 -- Opposite serialized order: original signup consumes the prepared role, then cancellation is denied.
 insert into auth.users(id,email) values('74000000-0000-4000-8000-000000000501','new-viewer@example.invalid');
 select p.id into prep_id from private.aqari_staff_account_preparations p where email='new-viewer@example.invalid';
 if not exists(select 1 from private.aqari_staff_account_preparations p where p.id=prep_id and p.status='registered' and p.revision=2 and p.registered_user_id='74000000-0000-4000-8000-000000000501') then raise exception 'Signup did not bind preparation';end if;
 if not exists(select 1 from public.aqari_memberships where user_id='74000000-0000-4000-8000-000000000501' and workspace_id=w and role::text='viewer' and is_active) or exists(select 1 from private.aqari_staff_assignments where user_id='74000000-0000-4000-8000-000000000501') then raise exception 'Signup changed original membership behavior';end if;
 perform pg_temp.staff_expect(w,'cancel',jsonb_build_object('request_id',gen_random_uuid(),'id',prep_id,'revision',2,'reason','Cannot cancel registered'),'STAFF_PREPARATION_ALREADY_REGISTERED');

 -- A failed bind rolls back Auth, membership/profile and preparation changes together.
 update private.aqari_allowed_users set role='general_manager' where email='new-accountant@example.invalid';
 begin
  insert into auth.users(id,email) values('74000000-0000-4000-8000-000000000502','new-accountant@example.invalid');
  raise exception 'Modified role was accepted';
 exception when insufficient_privilege then if sqlerrm<>'STAFF_PREPARATION_BIND_FAILED' then raise;end if;end;
 if exists(select 1 from auth.users where id='74000000-0000-4000-8000-000000000502') or exists(select 1 from public.aqari_memberships where user_id='74000000-0000-4000-8000-000000000502') or exists(select 1 from public.aqari_profiles where user_id='74000000-0000-4000-8000-000000000502') or not exists(select 1 from private.aqari_staff_account_preparations where email='new-accountant@example.invalid' and status='prepared' and revision=1) then raise exception 'Failed signup did not roll back atomically';end if;
 update private.aqari_allowed_users set role='accountant' where email='new-accountant@example.invalid';

 -- Audit and preparation history cannot be erased or silently rewritten.
 begin delete from private.aqari_staff_account_preparations p where p.id=prep_id;raise exception 'Expected immutable preparation';exception when object_not_in_prerequisite_state then null;end;
 begin update private.aqari_staff_preparation_audit set reason='replace';raise exception 'Expected immutable audit';exception when object_not_in_prerequisite_state then null;end;
 if has_table_privilege('authenticated','private.aqari_staff_account_preparations','SELECT') or has_table_privilege('anon','private.aqari_staff_preparation_audit','SELECT') or has_function_privilege('anon','public.aqari_staff_account_preparations(uuid,text,jsonb)','EXECUTE') or has_function_privilege('service_role','private.aqari_staff_account_preparations(uuid,text,jsonb)','EXECUTE') then raise exception 'Unexpected private access';end if;
 if (select prosecdef from pg_proc where oid='public.aqari_staff_account_preparations(uuid,text,jsonb)'::regprocedure) then raise exception 'Public RPC is not invoker';end if;
 raise notice 'Staff preparation: authorization, MFA, role whitelist, identity collisions, ownership, revisions, idempotency, signup ordering, rollback and ACL checks passed';
end$$;

-- Exercise the real authenticated public/private wrapper chain, not only the owner role.
select pg_temp.staff_actor('74000000-0000-4000-8000-000000000100');
set local role authenticated;
select public.aqari_staff_account_preparations('70000000-0000-4000-8000-000000000001','list','{}')->>'workspace_id';
do $$begin
 begin perform 1 from private.aqari_staff_account_preparations;raise exception 'Direct private table read allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
