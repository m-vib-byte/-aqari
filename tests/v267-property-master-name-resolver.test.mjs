import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../src/v267/pages/property-master-file.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../staging-database/sql/property-master-name-resolver.sql',import.meta.url),'utf8');
const start=page.indexOf('export async function openPropertyMasterFileByName(name)');
const end=page.indexOf('\n\nexport function openPropertyMasterFile(propertyId)',start);
const helper=start>=0&&end>start?page.slice(start,end):'';

test('property name entry no longer performs a direct aqari_properties table read',()=>{
 assert.ok(helper,'property name entry helper must exist');
 assert.doesNotMatch(helper,/\.from\(['"]aqari_properties['"]\)/);
 assert.match(helper,/\.rpc\(['"]aqari_property_master_resolve_by_name['"]/);
});

test('property name entry preserves session/workspace scope before opening the file',()=>{
 assert.match(helper,/initialUser=bridge\?\.context\?\.user\?\.id/);
 assert.match(helper,/initialWorkspace=bridge\?\.context\?\.workspace\?\.id/);
 assert.match(helper,/data\?\.workspace_id!==initialWorkspace/);
 assert.match(helper,/data\?\.user_id!==initialUser/);
 assert.match(helper,/data\?\.property_id/);
});

test('resolver filters matching names through property-scoped authorization',()=>{
 assert.match(sql,/p\.workspace_id=p_workspace_id/);
 assert.match(sql,/btrim\(p\.name\)=btrim\(p_name\)/);
 assert.match(sql,/private\.aqari_can_property\(p_workspace_id,p\.id,'properties','read'\)/);
 assert.match(sql,/PROPERTY_NOT_FOUND_OR_DENIED/);
 assert.match(sql,/PROPERTY_NAME_NOT_UNIQUE/);
});

test('resolver is security definer with an empty search path and authenticated-only execute',()=>{
 assert.match(sql,/security definer\s+set search_path=''/i);
 assert.match(sql,/revoke all on function public\.aqari_property_master_resolve_by_name\(uuid,text\) from public,anon/i);
 assert.match(sql,/grant execute on function public\.aqari_property_master_resolve_by_name\(uuid,text\) to authenticated/i);
});

test('resolver readback binds workspace, user and property id in its response',()=>{
 assert.match(sql,/'workspace_id',p_workspace_id/);
 assert.match(sql,/'user_id',auth\.uid\(\)/);
 assert.match(sql,/'property_id',v_property_id/);
});
