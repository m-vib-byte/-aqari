import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('general manager control center exposes safe label, section and staff-permission controls',()=>{
 const source=read('src/v267/pages/control-center.js');
 assert.match(source,/aq267-manager-control/);
 assert.match(source,/إدارة صلاحيات الموظفين والعقارات/);
 assert.match(source,/import\('\.\/staff-access\.js'\)/);
 assert.match(source,/CORE_LABEL_KEYS,GROUP_LABEL_KEYS,SERVICE_LABEL_KEYS/);
 assert.match(source,/settings\.sections/);
 assert.match(source,/settings\.permissions/);
 assert.match(source,/aqari_save_controls/);
 assert.match(source,/canonical\(verified\.control\.settings\)/);
});

test('luxury skin is runtime-loaded and remains visual-only',()=>{
 const dialog=read('src/v267/components/dialog.js'),css=read('src/v267/styles/ultra-luxury.css');
 assert.match(dialog,/aq267-ultra-luxury-css/);
 assert.match(dialog,/ultra-luxury\.css\?release=V267/);
 assert.match(css,/mobilebar/);
 assert.match(css,/aq267-manager-control/);
 assert.match(css,/aq267-service-group/);
 assert.match(css,/@media screen and \(min-width:700px\)/);
 assert.match(css,/@media screen and \(min-width:1180px\)/);
});

test('service directory uses semantic display keys for icons without replacing click handlers',()=>{
 const directory=read('src/v267/components/service-directory.js'),workspace=read('src/v267/workspace.js');
 assert.match(directory,/button\.dataset\.service=item\.source\?\.dataset\?\.aq267Label\|\|group\.key/);
 assert.match(directory,/item\.source\.click\(\)/);
 assert.match(workspace,/source\.dataset\.aq267Label=displayKey/);
});
