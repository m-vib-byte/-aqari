import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeTechnicianContact,technicianContactLinks,normalizeTenantPropertySupport} from '../src/v267/domain/tenant-property-technicians.js';

assert.equal(normalizeTechnicianContact('+965 9999-8888'),'+96599998888');
assert.equal(normalizeTechnicianContact('965(9999)8888'),'96599998888');
for(const unsafe of ['javascript:alert(1)','+965ABC12345','123','+'.padEnd(40,'9')])assert.equal(normalizeTechnicianContact(unsafe),'');
assert.deepEqual(technicianContactLinks({phone:'+965 9999 8888',whatsapp:'+965 5555 4444'}),{
 phone:'+96599998888',whatsapp:'+96555554444',tel:'tel:+96599998888',whatsappUrl:'https://wa.me/96555554444'
});
assert.equal(technicianContactLinks({phone:'javascript:alert(1)',whatsapp:'bad'}).tel,'');
assert.equal(technicianContactLinks({phone:'javascript:alert(1)',whatsapp:'bad'}).whatsappUrl,'');

const payload=normalizeTenantPropertySupport({
 workspaceId:'workspace-1',tenantId:'tenant-1',properties:[{
  propertyId:'property-1',propertyName:'برج تجريبي',techniciansEnabled:true,maintenanceEnabled:true,
  technicians:[{employeeId:'employee-1',nameAr:'فني العقار',nameEn:'Property Technician',jobAr:'صيانة',phone:'+965 9999 8888',whatsapp:'+965 5555 4444'}]
 }]
});
assert.equal(payload.properties[0].technicians[0].tel,'tel:+96599998888');
assert.equal(payload.properties[0].technicians[0].whatsappUrl,'https://wa.me/96555554444');
assert.throws(()=>normalizeTenantPropertySupport({workspaceId:'w',tenantId:'t',properties:[{propertyId:'p',propertyName:'x',techniciansEnabled:'yes',maintenanceEnabled:true,technicians:[]}]}),/INVALID_TENANT_PROPERTY_SUPPORT/);
assert.throws(()=>normalizeTenantPropertySupport({workspaceId:'w',tenantId:'t',properties:[{propertyId:'p',propertyName:'x',techniciansEnabled:true,maintenanceEnabled:true,technicians:[{employeeId:'e',nameAr:'x',nameEn:'',jobAr:'',phone:1,whatsapp:''}]}]}),/INVALID_TENANT_PROPERTY_SUPPORT/);

const sql=readFileSync(new URL('../staging-database/sql/tenant-property-technicians.sql',import.meta.url),'utf8');
assert.match(sql,/auth\.uid\(\) is null/);
assert.match(sql,/public\.aqari_portal_accounts/);
assert.match(sql,/private\.aqari_owns_tenant\(account\.workspace_id,account\.tenant_id\)/);
assert.match(sql,/lease\.status='signed'/);
assert.match(sql,/current_date between lease\.start_date and lease\.end_date/);
assert.match(sql,/settings->'technicians'/);
assert.match(sql,/assignment\.public_to_tenant/);
assert.match(sql,/assignment\.is_active/);
assert.match(sql,/employee\.status<>'inactive'/);
assert.match(sql,/revoke all on function public\.aqari_tenant_property_support\(\) from public,anon/);
assert.match(sql,/grant execute on function public\.aqari_tenant_property_support\(\) to authenticated/);

const html=readFileSync(new URL('../tenant.html',import.meta.url),'utf8');
assert.match(html,/id="tenantTechniciansSection" hidden/);
assert.match(html,/id="tenantTechniciansStatus"/);
assert.match(html,/src="\/src\/v267\/tenant-property-technicians\.js"/);
const ui=readFileSync(new URL('../src/v267/tenant-property-technicians.js',import.meta.url),'utf8');
assert.match(ui,/aqari_tenant_property_support/);
assert.match(ui,/textContent=value/);
assert.doesNotMatch(ui,/innerHTML/);
assert.match(ui,/verified\?\.data\?\.session\?\.user\?\.id!==userId/);
assert.match(ui,/property\.techniciansEnabled/);
assert.match(ui,/https:\/\/ofgmcsmxmdswlovsckqs\.supabase\.co/);

console.log('V267 tenant property technicians: PASS');
