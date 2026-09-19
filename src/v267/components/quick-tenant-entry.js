// Reuse the existing form only after its route and identity are still current.
export async function openQuickTenantEntry({scope,navigate,ready,page,visible}){
 const bound=scope();
 if(!bound)return false;
 if(await navigate('tenants')!==true)return false;
 const current=scope();
 if(!current||current.user!==bound.user||current.workspace!==bound.workspace||current.role!==bound.role||!ready('tenants'))return false;
 const button=page('tenants')?.querySelector('button[onclick="add()"]');
 if(!button||button.disabled||!visible(button))return false;
 button.click();
 return true;
}
