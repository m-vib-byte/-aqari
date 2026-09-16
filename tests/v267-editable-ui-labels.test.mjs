import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LABEL_KEYS,SECTIONS,label,validateSettings} from '../src/v267/components/catalog.js';

test('manager-editable labels remain display-only and validated',()=>{
 const custom={ar:{properties:'ملف العقارات',group_properties:'العقار والمستأجر',rental_contracts:'إدارة عقود الإيجار'},en:{properties:'Property file'}};
 assert.equal(label('properties','ar',custom),'ملف العقارات');
 assert.equal(label('group_properties','ar',custom),'العقار والمستأجر');
 assert.equal(label('rental_contracts','ar',custom),'إدارة عقود الإيجار');
 assert.equal(label('properties','en',custom),'Property file');
 assert.equal(label('properties','ar',{ar:{properties:'<b>bad</b>'}}),'العقارات');
 assert.deepEqual(SECTIONS,['home','collections','properties','tenants','contracts','maintenance','finance','employees','partners','documents','notifications','reports']);
 for(const key of ['properties','group_properties','rental_contracts','scan_document'])assert.equal(LABEL_KEYS.includes(key),true,key);
 const settings={sections:{properties:true},permissions:{},labels:custom};
 assert.equal(validateSettings(settings),settings);
 assert.throws(()=>validateSettings({sections:{properties:true},permissions:{},labels:{ar:{not_a_real_key:'x'}}}),/راجع المسميات/);
 assert.throws(()=>validateSettings({sections:{properties:true},permissions:{},labels:{ar:{properties:'<script>'}}}),/راجع المسميات/);
});

test('database save path keeps manager, revision and audit guards',()=>{
 const sql=fs.readFileSync(new URL('../staging-database/supabase/migrations/20260916153500_v267_editable_ui_labels.sql',import.meta.url),'utf8');
 for(const marker of [
  'private.aqari_manager(p_workspace_id)',
  'private.aqari_ui_label_keys()',
  'REVISION_CONFLICT',
  "'controls.update'",
  'revoke all on function public.aqari_save_controls(uuid,jsonb,bigint,text) from public,anon',
  'grant execute on function public.aqari_save_controls(uuid,jsonb,bigint,text) to authenticated'
 ])assert.equal(sql.includes(marker),true,marker);
 assert.match(sql,/label\.key=any\(private\.aqari_ui_label_keys\(\)\)/);
 assert.match(sql,/length\(btrim\(label\.value#>>'\{\}'\)\) not between 1 and 80/);
});

test('service label wiring changes text only while routing keys and handlers stay invariant',()=>{
 const installer=fs.readFileSync(new URL('../scripts/install-v267-property-ownership.mjs',import.meta.url),'utf8');
 for(const marker of [
  "[rentalContracts,'rental_contracts']",
  "[statements,'property_statements']",
  "source.dataset.aq267Label=displayKey",
  "groupLabel:key=>label('group_'+key,getLocale(),access?.labels||{})",
  'click handlers and backend keys are untouched'
 ])assert.equal(installer.includes(marker),true,marker);
 assert.doesNotMatch(installer,/dataset\.v199Go\s*=|dataset\.v205Route\s*=/);
});

test('service directory has an explicit iPad-safe section toggle and preserves expanded state',()=>{
 const directory=fs.readFileSync(new URL('../src/v267/components/service-directory.js',import.meta.url),'utf8');
 assert.match(directory,/summary\.onclick=event=>\{event\?\.preventDefault\?\.\(\);box\.open=!box\.open;\}/);
 assert.match(directory,/box\.open=!!query\|\|expanded\.has\(group\.key\)/);
 assert.match(directory,/if\(box\.open\)expanded\.add\(group\.key\);else expanded\.delete\(group\.key\)/);
 assert.match(directory,/const groupTitle=\(group,index\)=>\{try\{const value=groupLabel\?\.\(group\.key\)/);
});
