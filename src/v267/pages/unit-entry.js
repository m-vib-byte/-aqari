import {createDialog,node,field} from '../components/dialog.js';
import {t} from '../components/locale.js';
export function openUnitEntry(){
 const d=createDialog(t('إضافة وحدة'));if(!d)return false;
 d.run(async()=>{
  const access=await d.session.request(d.session.client.rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace}));d.session.check();
  if(access?.workspace_id!==d.session.bound.workspace||access?.user_id!==d.session.bound.user||access?.permissions?.properties?.write!==true)throw Error('ACCESS_DENIED');
  const rows=await d.session.request(d.session.client.from('aqari_properties').select('id,name').eq('workspace_id',d.session.bound.workspace).order('name'));d.session.check();
  if(!Array.isArray(rows))throw Error('INVALID_PROPERTIES');
  const form=node('form'),select=node('select'),empty=node('option',t('اختر العقار')),next=node('button',t('إضافة وحدة'));
  empty.value='';select.append(empty);select.required=true;
  for(const row of rows){const option=node('option',row.name);option.value=row.id;select.append(option);}
  next.type='submit';next.disabled=!rows.length;form.append(field(t('العقار'),select),next);d.body.replaceChildren(form);
  form.onsubmit=event=>{
   event.preventDefault();
   d.run(async()=>{
    if(!rows.some(row=>row.id===select.value))return;
    const id=select.value,module=await import('./property-unit-create.js');d.session.check();
    d.close();module.openPropertyUnitCreate(id);
   });
  };
 });
 return true;
}
