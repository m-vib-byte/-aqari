const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');

const guard=readFileSync(resolve(__dirname,'../staging-database/sql/partner-access-mfa-guard.sql'),'utf8');
const base=readFileSync(resolve(__dirname,'../staging-database/sql/partner-property-access.sql'),'utf8');

function index(source,needle){
 const value=source.indexOf(needle);
 assert.notEqual(value,-1,`missing ${needle}`);
 return value;
}

test('partner access grant, change and revoke paths require the recent MFA helper',()=>{
 assert.match(guard,/create or replace function private\.aqari_manage_partner_access/);
 assert.match(guard,/perform private\.aqari_require_sensitive_aal2\(w\);/);
});

test('recent MFA is checked before locks or partner-access mutation',()=>{
 const mfa=index(guard,'perform private.aqari_require_sensitive_aal2(w);');
 const workspaceLock=index(guard,'from public.aqari_workspaces where id=w for update;');
 const write=index(guard,'insert into private.aqari_partner_access(');
 assert.ok(mfa<workspaceLock,'recent MFA must precede workspace locking');
 assert.ok(mfa<write,'recent MFA must precede permission mutation');
});

test('the hardened replacement preserves revision locking and audit history',()=>{
 assert.match(guard,/coalesce\(old_row\.revision,0\) is distinct from expected/);
 assert.match(guard,/raise exception 'REVISION_CONFLICT'/);
 assert.match(guard,/insert into public\.aqari_control_audit/);
 assert.match(guard,/'partner\.access'/);
});

test('partner/staff conflict and property scoping remain fail closed',()=>{
 assert.match(guard,/p\.id=property and p\.workspace_id=w/);
 assert.match(guard,/PARTNER_STAFF_CONFLICT/);
 assert.match(guard,/public\.aqari_memberships/);
 assert.match(guard,/private\.aqari_allowed_users/);
});

test('existing public wrapper continues to delegate to the hardened private function',()=>{
 assert.match(base,/create function public\.aqari_manage_partner_access/);
 assert.match(base,/select private\.aqari_manage_partner_access\(p_workspace_id,p_email,p_property_id,p_name,p_enabled,p_expected_revision,p_reason\)/);
});
