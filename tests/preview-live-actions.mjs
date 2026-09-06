// Actual user clicks on the full application, never forced or mocked UI functions.
import assert from 'node:assert/strict';
async function visible(page,id){await page.waitForFunction(id=>{const e=document.getElementById(id);return e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none';},id);}
async function quickMenu(page,selector){
 await page.locator(selector).click();await page.waitForTimeout(250);
 const menu=await page.evaluate(()=>({open:document.getElementById('v201CreateMenu')?.getAttribute('aria-hidden'),focus:document.activeElement?.getAttribute('data-v201-create')}));
 assert.equal(menu.open,'false','quick-create dialog must open');
 assert.ok(menu.focus,'quick-create must focus an actionable option: '+JSON.stringify(menu));
 await page.evaluate(()=>window.AQARI_V205.refresh());await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-v201-create')),menu.focus,'dashboard refresh must preserve dialog focus');
 await page.locator('[data-v201-create-close]').click();
}
async function logoutState(page){return page.evaluate(()=>({
 unlocked:document.documentElement.classList.contains('aqari-auth-unlocked'),
 phase:document.getElementById('aqariCloudGateV168')?.getAttribute('data-auth-phase'),
 message:document.getElementById('cloudGateMsgV168')?.textContent,
 bridgeBound:window.logout===window.cloudLogoutV198,
 logoutCode:String(window.logout).slice(0,400),
 menu:document.getElementById('v199MoreMenu')?.className,
 clicks:window.__qaLogoutClicks||[]
}));}
export async function assertActualUI(page,scenario){
 page.on('pageerror',error=>console.log('QA_PAGE_ERROR',scenario,error.message));
 page.on('request',request=>{if(new URL(request.url()).pathname==='/auth/v1/logout')console.log('QA_LOGOUT_REQUEST',scenario,request.method());});
 for(const [route,target] of [['properties','list'],['tenants','list'],['collectionProPage','collectionProPage'],['maintenanceProPage','maintenanceProPage'],['home','home']]){
  await page.locator('.v199-primary-nav [data-v199-go="'+route+'"]').click();await visible(page,target);
 }
 console.log('QA_REAL_DESKTOP_NAVIGATION_OK',scenario);
 await page.locator('#v205DailyActions [data-v205-daily-action="contract"]').click();
 await page.waitForSelector('#v205PropertyChooser.on');
 assert.equal(await page.locator('#v205ChooserList [data-v205-property-index]').count(),scenario==='empty'?0:1,'contract chooser uses fixture properties only');
 await page.locator('[data-v205-chooser-close]').click();
 await quickMenu(page,'#aqariV199Topbar .v199-add-button[data-v201-quick]');
 console.log('QA_DESKTOP_DIALOG_FOCUS_OK',scenario);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'mobile overflow');
 for(const [route,target] of [['properties','list'],['collectionProPage','collectionProPage'],['maintenanceProPage','maintenanceProPage'],['home','home']]){
  await page.locator('.mobilebar [data-v199-go="'+route+'"]').click();await visible(page,target);
 }
 await page.locator('.mobilebar [data-v199-action="more"]').click();
 await page.locator('#v199MoreMenu [data-v199-go="tenants"]').click();await visible(page,'list');
 await page.locator('.mobilebar [data-v199-go="home"]').click();await visible(page,'home');
 await quickMenu(page,'#v205SimpleHome [data-v205-command="quick"]');
 console.log('QA_MOBILE_NAVIGATION_DIALOG_OK',scenario);
 await page.evaluate(()=>{window.__qaLogoutClicks=[];for(const capture of [true,false])document.addEventListener('click',e=>{if(e.target.closest('[data-v199-action="logout"]'))window.__qaLogoutClicks.push({capture,prevented:e.defaultPrevented});},capture);});
 await page.locator('.mobilebar [data-v199-action="more"]').click();
 console.log('QA_BEFORE_LOGOUT',scenario,JSON.stringify(await logoutState(page)));
 await page.locator('#v199MoreMenu [data-v199-action="logout"]').click();
 try{await page.waitForFunction(()=>!document.documentElement.classList.contains('aqari-auth-unlocked'));}
 catch(error){console.log('QA_FAILED_LOGOUT_STATE',scenario,JSON.stringify(await logoutState(page)));throw error;}
 await page.waitForTimeout(1300);
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('aqari-auth-unlocked')),false,'logout stays locked after reload');
 assert.equal(await page.evaluate(()=>Boolean(window.AQARI_DATA_GATE?.scope||window.AQARI_EARLY_STORAGE_GATE?.scope)),false,'logout seals both scopes');
 assert.equal(await page.evaluate(()=>document.body.innerText.includes('Synthetic Tenant')),false,'private text hidden after logout');
 console.log('QA_LOGOUT_OK',scenario);
}
